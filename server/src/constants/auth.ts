export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_COOKIE_NAME = 'vnav_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** Idle lifetime of a session; extended on every refresh. */
export const SESSION_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A previous refresh token presented within this window is treated as a concurrent-refresh race, not theft. */
export const REFRESH_RACE_GRACE_MS = 15 * 1000;

export const BCRYPT_COST = 12;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Abandoned unverified accounts are deleted by a TTL index after this long. */
export const PENDING_ACCOUNT_TTL_SECONDS = 7 * 24 * 60 * 60;

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
export const LOGIN_LOCK_BASE_SECONDS = 15 * 60;
export const LOGIN_LOCK_MAX_SECONDS = 4 * 60 * 60;

export const ROLES = ['student', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['pending_verification', 'active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** VIT registration number, e.g. 22BCE1234. */
export const REG_NO_PATTERN = /^\d{2}[A-Z]{3}\d{4}$/;

/** Crockford base32 without I, L, O, U. */
export const FRIEND_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const FRIEND_CODE_LENGTH = 5;
export const FRIEND_CODE_PREFIX = 'VNAV-';
