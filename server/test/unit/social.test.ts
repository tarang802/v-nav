import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { pairKeyOf } from '../../src/models/FriendRequest.js';
import { afterCursor, decodeCursor, encodeCursor } from '../../src/utils/cursor.js';
import { friendCode, pageQuery } from '../../src/validators/social.js';

describe('friend code input', () => {
  it('normalises case, prefix and Crockford look-alikes', () => {
    expect(friendCode.parse('VNAV-A82KD')).toBe('VNAV-A82KD');
    expect(friendCode.parse(' vnav-a82kd ')).toBe('VNAV-A82KD');
    expect(friendCode.parse('a82kd')).toBe('VNAV-A82KD');
    expect(friendCode.parse('AO2KL')).toBe('VNAV-A02K1');
    expect(friendCode.parse('vnav-i0o0l')).toBe('VNAV-10001');
  });

  it('rejects malformed codes', () => {
    for (const bad of ['', 'VNAV-', 'VNAV-ABCD', 'VNAV-ABCDEF', 'VNAV-AB*DE', 'VNAV-ABUDE', { $gt: '' }]) {
      expect(friendCode.safeParse(bad).success).toBe(false);
    }
  });
});

describe('pagination', () => {
  it('round-trips a cursor', () => {
    const id = new Types.ObjectId();
    const t = new Date('2026-11-11T10:00:00.000Z');
    const c = decodeCursor(encodeCursor(t, id))!;
    expect(c.t.getTime()).toBe(t.getTime());
    expect(c.id.equals(id)).toBe(true);
    expect(afterCursor('since', c)).toEqual({ $or: [{ since: { $lt: t } }, { since: t, _id: { $lt: id } }] });
  });

  it('rejects tampered cursors with a validation error', () => {
    const forged = Buffer.from(JSON.stringify({ t: { $gt: 0 }, id: 'x' })).toString('base64url');
    for (const bad of ['garbage', forged, Buffer.from('null').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrowError(expect.objectContaining({ status: 400 }));
    }
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('defaults and bounds the page size', () => {
    expect(pageQuery.parse({})).toEqual({ limit: 20 });
    expect(pageQuery.parse({ limit: '50' }).limit).toBe(50);
    expect(pageQuery.safeParse({ limit: '0' }).success).toBe(false);
    expect(pageQuery.safeParse({ limit: '51' }).success).toBe(false);
  });
});

describe('pairKey', () => {
  it('is the same in both directions', () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    expect(pairKeyOf(a, b)).toBe(pairKeyOf(b, a));
    expect(pairKeyOf(a, b)).not.toBe(pairKeyOf(a, new Types.ObjectId()));
  });
});
