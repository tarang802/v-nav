import { Types } from 'mongoose';
import { LocationRejectCode, MAX_ACCURACY_METERS, MAX_CLOCK_SKEW_MS } from '../constants/location.js';
import type { DomainEvents, LocationStopReason } from '../events/domainEvents.js';
import type { Geofence } from '../realtime/geofence.js';
import type { LocationUpdate } from '../validators/location.js';
import type { LocationStore, ShareState, StoredLocation } from './locationStore.js';
import type { RelationshipCache } from './relationshipCache.js';

export type UpdateOutcome =
  | { ok: true; location: StoredLocation; recipients: string[] }
  | { ok: false; code: LocationRejectCode; offCampusRecipients?: string[] };

/**
 * Location-sharing rules, independent of the transport. Positions live only in
 * Redis (LocationStore); the hot path touches MongoDB only on a friend-cache miss.
 */
export class LocationService {
  constructor(
    private readonly store: LocationStore,
    private readonly cache: RelationshipCache,
    private readonly geofence: Geofence,
    private readonly events: DomainEvents,
  ) {}

  start(userId: Types.ObjectId, durationMinutes: number | null): Promise<ShareState> {
    return this.store.start(userId, durationMinutes);
  }

  state(userId: Types.ObjectId): Promise<ShareState> {
    return this.store.state(userId);
  }

  /** Stops sharing and tells friends (via the event bus). Safe to call when not sharing. */
  async stop(userId: Types.ObjectId, reason: LocationStopReason): Promise<boolean> {
    const wasSharing = await this.store.stop(userId);
    if (wasSharing) await this.events.emit('location.stopped', { userId, reason });
    return wasSharing;
  }

  /** Ends timed shares that have run out. Each expiry is handled by exactly one instance. */
  async sweepExpired(now = Date.now()): Promise<number> {
    const expired = await this.store.claimExpired(now);
    for (const uid of expired) {
      await this.events.emit('location.stopped', { userId: new Types.ObjectId(uid), reason: 'expired' });
    }
    return expired.length;
  }

  /**
   * Validates and stores one position update and returns who may receive it.
   * Cheapest checks first; any failure drops the update.
   */
  async processUpdate(userId: Types.ObjectId, update: LocationUpdate, now = Date.now()): Promise<UpdateOutcome> {
    const uid = userId.toHexString();
    if (Math.abs(update.ts - now) > MAX_CLOCK_SKEW_MS) return { ok: false, code: LocationRejectCode.VALIDATION_ERROR };
    if (update.accuracy > MAX_ACCURACY_METERS) return { ok: false, code: LocationRejectCode.LOW_ACCURACY };
    if (!(await this.store.takeRateSlot(uid))) return { ok: false, code: LocationRejectCode.RATE_LIMITED };
    if (!(await this.store.isSharing(uid))) return { ok: false, code: LocationRejectCode.NOT_SHARING };

    if (!this.geofence.contains(update.lat, update.lng)) {
      const firstTime = await this.store.markOffCampus(uid);
      return {
        ok: false,
        code: LocationRejectCode.OFF_CAMPUS,
        ...(firstTime ? { offCampusRecipients: [...(await this.cache.friendIds(userId))] } : {}),
      };
    }

    const location: StoredLocation = { userId: uid, lat: update.lat, lng: update.lng, accuracy: update.accuracy, ts: update.ts };
    await this.store.save(location);
    return { ok: true, location, recipients: [...(await this.cache.friendIds(userId))] };
  }

  /** Positions of the user's friends who are sharing right now. */
  async friendLocations(userId: Types.ObjectId): Promise<StoredLocation[]> {
    return this.store.getMany([...(await this.cache.friendIds(userId))]);
  }

  locationOf(uid: string): Promise<StoredLocation | null> {
    return this.store.get(uid);
  }
}
