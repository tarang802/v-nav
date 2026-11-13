import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_VISIBILITIES } from '../constants/events.js';
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from '../constants/social.js';

/** Single-line text: no control characters (they have no place in a title and can spoof layouts). */
const singleLine = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]*$/, 'Must not contain control characters');

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const location = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const venue = z.strictObject({
  /** OpenStreetMap id of a campus building, as in campus-buildings.geojson (`way/123`). */
  buildingId: z
    .string()
    .regex(/^(way|relation)\/\d{1,12}$/)
    .nullish(),
  label: singleLine(1, 100),
});

const fields = {
  title: singleLine(3, 100),
  // Newlines and tabs are allowed in descriptions; other control characters are not.
  description: z
    .string()
    .trim()
    .max(2000)
    .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/, 'Must not contain control characters'),
  category: z.enum(EVENT_CATEGORIES),
  location,
  venue,
  startsAt: isoDate,
  endsAt: isoDate,
  visibility: z.enum(EVENT_VISIBILITIES),
};

export const createEventBody = z.strictObject({ ...fields, description: fields.description.optional() });

export const updateEventBody = z
  .strictObject({
    title: fields.title.optional(),
    description: fields.description.optional(),
    category: fields.category.optional(),
    location: fields.location.optional(),
    venue: fields.venue.optional(),
    startsAt: fields.startsAt.optional(),
    endsAt: fields.endsAt.optional(),
    visibility: fields.visibility.optional(),
    /** Cancelling is one-way. */
    status: z.literal('cancelled').optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');

export const listEventsQuery = z.strictObject({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  visibility: z.enum(EVENT_VISIBILITIES).optional(),
  creator: z.literal('me').optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  cursor: z.string().max(200).optional(),
});

/** `minLng,minLat,maxLng,maxLat`, at most one degree on a side (far larger than the campus). */
const bbox = z
  .string()
  .max(100)
  .transform((s, ctx) => {
    const n = s.split(',').map(Number);
    const [minLng, minLat, maxLng, maxLat] = n;
    const ok =
      n.length === 4 &&
      n.every(Number.isFinite) &&
      minLng! >= -180 &&
      maxLng! <= 180 &&
      minLat! >= -90 &&
      maxLat! <= 90 &&
      minLng! < maxLng! &&
      minLat! < maxLat! &&
      maxLng! - minLng! <= 1 &&
      maxLat! - minLat! <= 1;
    if (!ok) {
      ctx.addIssue({ code: 'custom', message: 'bbox must be minLng,minLat,maxLng,maxLat covering at most one degree' });
      return z.NEVER;
    }
    return { minLng: minLng!, minLat: minLat!, maxLng: maxLng!, maxLat: maxLat! };
  });

export const mapEventsQuery = z.strictObject({ bbox, from: isoDate.optional(), to: isoDate.optional() });

export const eventIdParams = z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid event id') });
