/** Real-time location limits. Documented in docs/SOCKET_EVENTS.md. */

/** Allowed timed-sharing durations; `null` means until stopped (capped at SHARE_MAX_MS). */
export const SHARE_DURATIONS_MINUTES = [15, 60, 240] as const;
export const SHARE_MAX_MS = 12 * 60 * 60 * 1000;

/** A position older than this is deleted (stale detection). */
export const LOCATION_TTL_MS = 120_000;
/** Minimum gap between accepted updates per user, shared across tabs and instances. */
export const LOCATION_MIN_INTERVAL_MS = 2_000;
/** Fixes less accurate than this are rejected (indoor GPS noise). */
export const MAX_ACCURACY_METERS = 100;
/** Client timestamps further than this from server time are rejected. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const PRESENCE_TTL_MS = 90_000;
export const PRESENCE_REFRESH_MS = 30_000;

export const SHARE_SWEEP_INTERVAL_MS = 5_000;
export const TOKEN_CHECK_INTERVAL_MS = 60_000;
/** Sockets whose access token expired more than this long ago are disconnected. */
export const TOKEN_GRACE_SECONDS = 60;

/** Per-socket flood guard: at most this many events per window, else disconnect. */
export const SOCKET_EVENT_BURST = 40;
export const SOCKET_EVENT_WINDOW_MS = 10_000;
export const SNAPSHOT_MIN_INTERVAL_MS = 5_000;
/** `location:rejected { code: RATE_LIMITED }` is sent at most this often per socket. */
export const RATE_LIMIT_NOTICE_INTERVAL_MS = 10_000;

/** Socket.IO `maxHttpBufferSize`: larger frames close the socket. */
export const SOCKET_MAX_PAYLOAD_BYTES = 16 * 1024;

export const LocationRejectCode = {
  NOT_SHARING: 'NOT_SHARING',
  OFF_CAMPUS: 'OFF_CAMPUS',
  LOW_ACCURACY: 'LOW_ACCURACY',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
export type LocationRejectCode = (typeof LocationRejectCode)[keyof typeof LocationRejectCode];
