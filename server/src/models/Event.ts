import { Schema, type InferSchemaType, Types } from 'mongoose';
import { EVENT_CATEGORIES, EVENT_STATUSES, EVENT_VISIBILITIES } from '../constants/events.js';

export const eventSchema = new Schema(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    /** Plain text. Clients render it as text, never as HTML. */
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, enum: EVENT_CATEGORIES, required: true },
    image: { type: new Schema({ key: String, url: String }, { _id: false }), default: null },
    /** GeoJSON Point, [lng, lat]. Always inside the campus boundary (checked by EventService). */
    location: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    venue: {
      buildingId: { type: String, default: null },
      label: { type: String, required: true, trim: true, maxlength: 100 },
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    visibility: { type: String, enum: EVENT_VISIBILITIES, required: true },
    status: { type: String, enum: EVENT_STATUSES, default: 'active', required: true },
  },
  { timestamps: true, collection: 'events' },
);

// Campus-wide discovery: upcoming or ongoing, sorted by start.
eventSchema.index({ visibility: 1, endsAt: 1, startsAt: 1 });
// "My events" and friends-only events (creatorId $in friends).
eventSchema.index({ creatorId: 1, startsAt: -1 });
// Map viewport queries.
eventSchema.index({ location: '2dsphere' });
eventSchema.index({ category: 1, startsAt: 1 });

export type Event = Omit<InferSchemaType<typeof eventSchema>, 'location'> & {
  _id: Types.ObjectId;
  /** Required by the schema; the inferred type marks nested objects optional. */
  location: { type: 'Point'; coordinates: number[] };
  createdAt: Date;
  updatedAt: Date;
};
