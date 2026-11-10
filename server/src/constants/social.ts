/** Friend-system limits. Documented in docs/DATABASE_SCHEMA.md §2.5–2.7. */
export const MAX_FRIENDS = 1000;
export const MAX_OUTGOING_REQUESTS = 50;
export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;
/** Redis relationship cache lifetime (friends:{id}, blocks:{id}). */
export const RELATION_CACHE_TTL_SECONDS = 10 * 60;
