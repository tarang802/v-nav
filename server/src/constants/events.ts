/** Event limits. Documented in docs/DATABASE_SCHEMA.md §2.8 and docs/API_DOCUMENTATION.md §7. */
export const EVENT_CATEGORIES = ['academic', 'technical', 'cultural', 'sports', 'club', 'career', 'social', 'other'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_VISIBILITIES = ['campus', 'friends'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const EVENT_STATUSES = ['active', 'cancelled'] as const;

export const EVENT_MAX_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
/** Events cannot be scheduled further ahead than this. */
export const EVENT_MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
/** Default and maximum listing window. */
export const EVENT_DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const EVENT_MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
export const EVENT_MAP_MAX_FEATURES = 500;

/** Uploads. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_IMAGE_MAX_PX = 1600;
export const AVATAR_MAX_PX = 512;
/** Images with more pixels than this are refused before decoding (decompression-bomb guard). */
export const IMAGE_MAX_INPUT_PIXELS = 40_000_000;
