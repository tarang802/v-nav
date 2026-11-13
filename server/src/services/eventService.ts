import { Types } from 'mongoose';
import type { Role } from '../constants/auth.js';
import { ErrorCode } from '../constants/errorCodes.js';
import {
  EVENT_DEFAULT_WINDOW_MS,
  EVENT_IMAGE_MAX_PX,
  EVENT_MAP_MAX_FEATURES,
  EVENT_MAX_AHEAD_MS,
  EVENT_MAX_DURATION_MS,
  EVENT_MAX_WINDOW_MS,
  type EventCategory,
  type EventVisibility,
} from '../constants/events.js';
import type { DomainEvents } from '../events/domainEvents.js';
import type { Event } from '../models/Event.js';
import type { User } from '../models/User.js';
import type { Geofence } from '../realtime/geofence.js';
import type { Bbox, EventFilter, EventRepository } from '../repositories/eventRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';
import { AppError } from '../utils/AppError.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';
import type { AuditService } from './auditService.js';
import type { ImageService } from './imageService.js';
import { Limits, type RateLimiter } from './rateLimiter.js';
import type { RelationshipCache } from './relationshipCache.js';

type Id = Types.ObjectId;

export interface EventInput {
  title: string;
  description?: string | undefined;
  category: EventCategory;
  location: { lat: number; lng: number };
  venue: { buildingId?: string | null | undefined; label: string };
  startsAt: Date;
  endsAt: Date;
  visibility: EventVisibility;
}
export type EventPatch = Partial<EventInput> & { status?: 'cancelled' | undefined };

export interface EventListQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  category?: EventCategory | undefined;
  visibility?: EventVisibility | undefined;
  creator?: 'me' | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface Viewer {
  id: Id;
  role: Role;
  ipHash: string;
}

export interface EventServiceDeps {
  events: EventRepository;
  users: UserRepository;
  cache: RelationshipCache;
  geofence: Geofence;
  images: ImageService;
  limiter: RateLimiter;
  audit: AuditService;
  bus: DomainEvents;
  appPublicUrl: string;
}

const notFound = () => AppError.notFound('Event not found');
const unprocessable = (code: ErrorCode, message: string) => new AppError(422, code, message);

/**
 * Events: creation, discovery and moderation. The rules about who may see an
 * event live only here; the visibility filter is never built from client input.
 */
export class EventService {
  constructor(private readonly d: EventServiceDeps) {}

  // ── Visibility ───────────────────────────────────────────────────────────

  /** Active events the viewer may see: campus-wide, or friends-only from the viewer and their friends; never from blocked users. */
  private async visibleFilter(viewerId: Id): Promise<EventFilter> {
    const [friends, blocked] = await Promise.all([this.d.cache.friendIds(viewerId), this.d.cache.blockedEitherWay(viewerId)]);
    const circle = [viewerId, ...[...friends].map((id) => new Types.ObjectId(id))];
    return {
      status: 'active',
      $or: [{ visibility: 'campus' }, { visibility: 'friends', creatorId: { $in: circle } }],
      ...(blocked.size ? { creatorId: { $nin: [...blocked].map((id) => new Types.ObjectId(id)) } } : {}),
    };
  }

  /** The creator always sees their own event. Others see it if it is campus-wide or they are friends, and no block exists. */
  private async canSee(viewerId: Id, event: Event): Promise<boolean> {
    if (event.creatorId.equals(viewerId)) return true;
    if (await this.d.cache.isBlockedEitherWay(viewerId, event.creatorId)) return false;
    if (event.visibility === 'campus') return true;
    return this.d.cache.areFriends(viewerId, event.creatorId);
  }

  private async loadVisible(viewerId: Id, eventId: Id): Promise<Event> {
    const event = await this.d.events.findById(eventId);
    if (!event || !(await this.canSee(viewerId, event))) throw notFound();
    return event;
  }

  // ── Rules ────────────────────────────────────────────────────────────────

  private assertOnCampus(location: { lat: number; lng: number }) {
    if (!this.d.geofence.contains(location.lat, location.lng)) {
      throw unprocessable(ErrorCode.OFF_CAMPUS, 'Events must be located on campus');
    }
  }

  private assertTimes(startsAt: Date, endsAt: Date, now = Date.now()) {
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw unprocessable(ErrorCode.INVALID_TIME_RANGE, 'The event must end after it starts');
    }
    if (endsAt.getTime() - startsAt.getTime() > EVENT_MAX_DURATION_MS) {
      throw unprocessable(ErrorCode.INVALID_TIME_RANGE, 'Events can last at most 14 days');
    }
    if (endsAt.getTime() <= now) {
      throw unprocessable(ErrorCode.INVALID_TIME_RANGE, 'The event has already ended');
    }
    if (startsAt.getTime() > now + EVENT_MAX_AHEAD_MS) {
      throw unprocessable(ErrorCode.INVALID_TIME_RANGE, 'Events can be scheduled at most a year ahead');
    }
  }

  // ── Create, read ─────────────────────────────────────────────────────────

  async create(viewer: Viewer, input: EventInput) {
    await this.d.limiter.consume(Limits.eventCreateUser, viewer.id.toHexString());
    this.assertOnCampus(input.location);
    this.assertTimes(input.startsAt, input.endsAt);

    const event = await this.d.events.create({
      creatorId: viewer.id,
      title: input.title,
      description: input.description ?? '',
      category: input.category,
      location: { type: 'Point', coordinates: [input.location.lng, input.location.lat] },
      venue: { buildingId: input.venue.buildingId ?? null, label: input.venue.label },
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      visibility: input.visibility,
    });
    await this.announce(event, 'created');
    return (await this.present(viewer.id, [event]))[0]!;
  }

  async get(viewer: Viewer, eventId: Id) {
    const event = await this.loadVisible(viewer.id, eventId);
    const [presented] = await this.present(viewer.id, [event]);
    if (!presented) throw notFound(); // creator account no longer active
    return presented;
  }

  async list(viewer: Viewer, q: EventListQuery) {
    const { from, to } = this.window(q.from, q.to);
    const base: EventFilter = { endsAt: { $gte: from }, startsAt: { $lte: to } };
    if (q.category) base.category = q.category;
    if (q.visibility) base.visibility = q.visibility;

    // "My events" includes cancelled ones; everyone else's are filtered by visibility.
    const filter = q.creator === 'me' ? { ...base, creatorId: viewer.id } : { $and: [base, await this.visibleFilter(viewer.id)] };

    const rows = await this.d.events.list(filter, q.limit + 1, decodeCursor(q.cursor));
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: await this.present(viewer.id, page),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.startsAt, last._id) : null,
    };
  }

  /** GeoJSON for the map layer: lightweight properties only, capped at 500 features. */
  async map(viewer: Viewer, q: { bbox: Bbox; from?: Date | undefined; to?: Date | undefined }) {
    const { from, to } = this.window(q.from, q.to);
    const filter = { $and: [{ endsAt: { $gte: from }, startsAt: { $lte: to } }, await this.visibleFilter(viewer.id)] };
    const rows = await this.d.events.inBox(filter, q.bbox, EVENT_MAP_MAX_FEATURES);
    return {
      type: 'FeatureCollection' as const,
      features: rows.map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: e.location.coordinates },
        properties: { id: e._id.toHexString(), title: e.title, category: e.category, startsAt: e.startsAt, endsAt: e.endsAt },
      })),
    };
  }

  private window(from?: Date, to?: Date) {
    const start = from ?? new Date();
    const end = to ?? new Date(start.getTime() + EVENT_DEFAULT_WINDOW_MS);
    if (end.getTime() <= start.getTime()) {
      throw AppError.validation([{ path: 'query.to', message: '"to" must be after "from"' }]);
    }
    if (end.getTime() - start.getTime() > EVENT_MAX_WINDOW_MS) {
      throw AppError.validation([{ path: 'query.to', message: 'The date range can cover at most one year' }]);
    }
    return { from: start, to: end };
  }

  // ── Update, cancel, delete ───────────────────────────────────────────────

  private async loadOwned(viewer: Viewer, eventId: Id): Promise<Event> {
    const event = await this.loadVisible(viewer.id, eventId);
    if (!event.creatorId.equals(viewer.id)) throw AppError.forbidden('Only the organiser can change this event');
    return event;
  }

  async update(viewer: Viewer, eventId: Id, patch: EventPatch) {
    const current = await this.loadOwned(viewer, eventId);

    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.venue !== undefined) set.venue = { buildingId: patch.venue.buildingId ?? null, label: patch.venue.label };
    if (patch.location !== undefined) {
      this.assertOnCampus(patch.location);
      set.location = { type: 'Point', coordinates: [patch.location.lng, patch.location.lat] };
    }
    if (patch.startsAt !== undefined || patch.endsAt !== undefined) {
      const startsAt = patch.startsAt ?? current.startsAt;
      const endsAt = patch.endsAt ?? current.endsAt;
      this.assertTimes(startsAt, endsAt);
      set.startsAt = startsAt;
      set.endsAt = endsAt;
    }

    const updated = await this.d.events.update(eventId, set);
    if (!updated) throw notFound();
    // Friends must hear about it if the event was, or now is, friends-only.
    await this.announce(updated, patch.status === 'cancelled' ? 'cancelled' : 'updated', current.visibility === 'friends');
    return (await this.present(viewer.id, [updated]))[0]!;
  }

  /** The organiser may delete their event; moderators and admins may delete any event they can see (audited). */
  async remove(viewer: Viewer, eventId: Id): Promise<void> {
    const event = await this.d.events.findById(eventId);
    if (!event) throw notFound();
    const isCreator = event.creatorId.equals(viewer.id);
    const isModerator = viewer.role === 'moderator' || viewer.role === 'admin';
    if (!isCreator && !isModerator) {
      // Do not reveal a hidden event's existence through a 403.
      if (!(await this.canSee(viewer.id, event))) throw notFound();
      throw AppError.forbidden('Only the organiser can delete this event');
    }

    const deleted = await this.d.events.delete(eventId);
    if (!deleted) throw notFound();
    await this.d.images.remove(deleted.image?.key);
    if (!isCreator) {
      await this.d.audit.record({
        action: 'event_removed_by_moderator',
        actorId: viewer.id,
        targetId: deleted._id,
        ipHash: viewer.ipHash,
        meta: { creatorId: deleted.creatorId.toHexString(), title: deleted.title },
      });
    }
    await this.announce(deleted, 'deleted');
  }

  // ── Image ────────────────────────────────────────────────────────────────

  async setImage(viewer: Viewer, eventId: Id, file: Buffer): Promise<{ imageUrl: string }> {
    await this.loadOwned(viewer, eventId);
    await this.d.limiter.consume(Limits.uploadUser, viewer.id.toHexString());
    const stored = await this.d.images.store(file, 'events', EVENT_IMAGE_MAX_PX);
    const before = await this.d.events.swapImage(eventId, viewer.id, stored);
    if (!before) {
      await this.d.images.remove(stored.key); // event vanished meanwhile
      throw notFound();
    }
    await this.d.images.remove(before.image?.key);
    await this.announce(before, 'updated');
    return { imageUrl: stored.url };
  }

  async removeImage(viewer: Viewer, eventId: Id): Promise<void> {
    await this.loadOwned(viewer, eventId);
    const before = await this.d.events.swapImage(eventId, viewer.id, null);
    if (!before) throw notFound();
    await this.d.images.remove(before.image?.key);
    await this.announce(before, 'updated');
  }

  // ── Presentation ─────────────────────────────────────────────────────────

  /** Adds the organiser's public details. Events whose organiser is no longer active are left out. */
  private async present(viewerId: Id, events: Event[]) {
    const creators = await this.d.users.findActiveByIds([...new Map(events.map((e) => [e.creatorId.toHexString(), e.creatorId])).values()]);
    return events.flatMap((e) => {
      const creator = creators.get(e.creatorId.toHexString());
      return creator ? [this.toApi(e, creator, viewerId)] : [];
    });
  }

  private toApi(e: Event, creator: User, viewerId: Id) {
    const id = e._id.toHexString();
    return {
      id,
      title: e.title,
      description: e.description ?? '',
      category: e.category,
      imageUrl: e.image?.url ?? null,
      location: { lat: e.location.coordinates[1]!, lng: e.location.coordinates[0]! },
      venue: { buildingId: e.venue?.buildingId ?? null, label: e.venue?.label ?? '' },
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      visibility: e.visibility,
      status: e.status,
      creator: { id: creator._id.toHexString(), name: creator.name, avatarUrl: creator.avatar?.url ?? null },
      canEdit: e.creatorId.equals(viewerId),
      shareUrl: `${this.d.appPublicUrl}/events/${id}`,
      createdAt: e.createdAt,
    };
  }

  private announce(e: Event, change: 'created' | 'updated' | 'cancelled' | 'deleted', wasFriendsOnly = false) {
    return this.d.bus.emit('event.changed', {
      eventId: e._id,
      creatorId: e.creatorId,
      change,
      friendsOnly: e.visibility === 'friends' || wasFriendsOnly,
    });
  }
}
