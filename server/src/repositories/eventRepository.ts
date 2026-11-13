import type { Types } from 'mongoose';
import type { Models } from '../models/index.js';
import type { Event } from '../models/Event.js';
import { afterCursor, type CursorKey } from '../utils/cursor.js';

type Id = Types.ObjectId;
export type EventFilter = Record<string, unknown>;

export interface NewEvent {
  creatorId: Id;
  title: string;
  description: string;
  category: string;
  location: { type: 'Point'; coordinates: [number, number] };
  venue: { buildingId: string | null; label: string };
  startsAt: Date;
  endsAt: Date;
  visibility: string;
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Persistence only. Which events a viewer may see is decided by EventService, which builds the filters. */
export class EventRepository {
  constructor(private readonly models: Models) {}

  async create(data: NewEvent): Promise<Event> {
    const doc = await this.models.Event.create(data);
    return doc.toObject() as Event;
  }

  findById(id: Id) {
    return this.models.Event.findById(id).lean<Event>().exec();
  }

  update(id: Id, set: Record<string, unknown>) {
    return this.models.Event.findOneAndUpdate({ _id: id }, { $set: set }, { new: true, runValidators: true })
      .lean<Event>()
      .exec();
  }

  /** Sets or clears the image and returns the document as it was before, so the old file can be removed. */
  swapImage(id: Id, creatorId: Id, image: { key: string; url: string } | null) {
    return this.models.Event.findOneAndUpdate({ _id: id, creatorId }, { $set: { image } }, { new: false })
      .lean<Event>()
      .exec();
  }

  delete(id: Id) {
    return this.models.Event.findOneAndDelete({ _id: id }).lean<Event>().exec();
  }

  /** Soonest first, with a stable (startsAt, _id) cursor. */
  list(filter: EventFilter, limit: number, cursor: CursorKey | null) {
    return this.models.Event.find({ $and: [filter, afterCursor('startsAt', cursor, 'asc')] })
      .sort({ startsAt: 1, _id: 1 })
      .limit(limit)
      .lean<Event[]>()
      .exec();
  }

  /** Events inside a bounding box, with only the fields the map layer needs. */
  inBox(filter: EventFilter, b: Bbox, limit: number) {
    const ring = [
      [b.minLng, b.minLat],
      [b.maxLng, b.minLat],
      [b.maxLng, b.maxLat],
      [b.minLng, b.maxLat],
      [b.minLng, b.minLat],
    ];
    return this.models.Event.find(
      { $and: [filter, { location: { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [ring] } } } }] },
      { title: 1, category: 1, startsAt: 1, endsAt: 1, location: 1 },
    )
      .sort({ startsAt: 1 })
      .limit(limit)
      .lean<Pick<Event, '_id' | 'title' | 'category' | 'startsAt' | 'endsAt' | 'location'>[]>()
      .exec();
  }
}
