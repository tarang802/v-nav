import { z } from 'zod';
import { SHARE_DURATIONS_MINUTES } from '../constants/location.js';

export const shareStartPayload = z.strictObject({
  durationMinutes: z.union([...SHARE_DURATIONS_MINUTES.map((m) => z.literal(m)), z.null()] as [
    z.ZodLiteral<15>,
    z.ZodLiteral<60>,
    z.ZodLiteral<240>,
    z.ZodNull,
  ]),
});

/** Unknown keys are stripped. heading/speed are accepted but never stored or forwarded. */
export const locationUpdatePayload = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().gt(0).max(5000),
  heading: z.number().finite().min(0).max(360).nullish(),
  speed: z.number().finite().min(0).max(100).nullish(),
  ts: z.number().int().positive(),
});
export type LocationUpdate = z.infer<typeof locationUpdatePayload>;

export const authRefreshPayload = z.strictObject({ token: z.string().min(1).max(4096) });

export const emptyPayload = z.object({}).optional();
