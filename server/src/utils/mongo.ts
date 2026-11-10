/** True when `err` is a MongoDB duplicate-key error, optionally on a specific indexed field. */
export const isDuplicateKey = (err: unknown, field?: string): boolean => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e?.code === 11000 && (!field || Boolean(e.keyPattern && field in e.keyPattern));
};
