import { Types } from 'mongoose';
import { AppError } from './AppError.js';

/**
 * Opaque pagination cursor: base64url of `{ t: sortTimeMs, id: objectIdHex }`.
 * Results are sorted by (time desc, _id desc), so the cursor is the last item's
 * key and the next page is everything strictly after it.
 */
export interface CursorKey {
  t: Date;
  id: Types.ObjectId;
}

export function encodeCursor(t: Date, id: Types.ObjectId): string {
  return Buffer.from(JSON.stringify({ t: t.getTime(), id: id.toHexString() })).toString('base64url');
}

export function decodeCursor(raw: string | undefined): CursorKey | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown };
    if (typeof v.t !== 'number' || !Number.isFinite(v.t) || typeof v.id !== 'string' || !/^[a-f0-9]{24}$/.test(v.id)) {
      throw new Error('bad cursor');
    }
    return { t: new Date(v.t), id: new Types.ObjectId(v.id) };
  } catch {
    throw AppError.validation([{ path: 'query.cursor', message: 'Invalid cursor' }]);
  }
}

/** Mongo filter for "strictly after the cursor" given a (field desc, _id desc) sort. */
export function afterCursor(field: string, c: CursorKey | null): Record<string, unknown> {
  if (!c) return {};
  return { $or: [{ [field]: { $lt: c.t } }, { [field]: c.t, _id: { $lt: c.id } }] };
}
