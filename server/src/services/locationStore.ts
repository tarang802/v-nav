import type { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import { LOCATION_MIN_INTERVAL_MS, LOCATION_TTL_MS, SHARE_MAX_MS } from '../constants/location.js';

export interface ShareState {
  sharing: boolean;
  startedAt: Date | null;
  expiresAt: Date | null;
}

export interface StoredLocation {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
}

const EXPIRY_SET = 'share:expiry';
const shareKey = (uid: string) => `share:${uid}`;
const locKey = (uid: string) => `loc:${uid}`;
const rateKey = (uid: string) => `loc:rl:${uid}`;
const offCampusKey = (uid: string) => `loc:off:${uid}`;

const NOT_SHARING: ShareState = { sharing: false, startedAt: null, expiresAt: null };

/**
 * Ephemeral sharing state and latest positions, in Redis only. Nothing here is
 * ever written to MongoDB. Every key has a TTL, so losing an instance or the
 * sweeper can never leave a position visible forever.
 *
 * - `share:{uid}`  hash { startedAt, expiresAt }   expires at the end of the share (timed) or after 12 h
 * - `share:expiry` sorted set uid → end time       lets one instance claim each expiry and notify friends
 * - `loc:{uid}`    hash { lat, lng, acc, ts }      120 s, refreshed on each accepted update
 * - `loc:rl:{uid}` rate-limit marker               2 s
 * - `loc:off:{uid}` "friends already told I left campus" marker
 */
export class LocationStore {
  constructor(private readonly redis: Redis) {}

  async start(userId: Types.ObjectId, durationMinutes: number | null, now = Date.now()): Promise<ShareState> {
    const uid = userId.toHexString();
    const expiresAt = durationMinutes === null ? null : now + durationMinutes * 60_000;
    const hardEnd = expiresAt ?? now + SHARE_MAX_MS;
    await this.redis
      .multi()
      .del(shareKey(uid))
      .hset(shareKey(uid), { startedAt: String(now), expiresAt: expiresAt === null ? '' : String(expiresAt) })
      .pexpireat(shareKey(uid), hardEnd)
      .zadd(EXPIRY_SET, hardEnd, uid)
      .exec();
    return { sharing: true, startedAt: new Date(now), expiresAt: expiresAt === null ? null : new Date(expiresAt) };
  }

  async state(userId: Types.ObjectId): Promise<ShareState> {
    const h = await this.redis.hgetall(shareKey(userId.toHexString()));
    if (!h.startedAt) return NOT_SHARING;
    return {
      sharing: true,
      startedAt: new Date(Number(h.startedAt)),
      expiresAt: h.expiresAt ? new Date(Number(h.expiresAt)) : null,
    };
  }

  /** Ends sharing and deletes the position. Returns true if the user was sharing. */
  async stop(userId: Types.ObjectId): Promise<boolean> {
    const uid = userId.toHexString();
    const res = await this.redis.multi().del(shareKey(uid)).del(locKey(uid)).del(offCampusKey(uid)).zrem(EXPIRY_SET, uid).exec();
    const deletedShare = res?.[0]?.[1];
    const removedFromSet = res?.[3]?.[1];
    return deletedShare === 1 || removedFromSet === 1;
  }

  async isSharing(uid: string): Promise<boolean> {
    return (await this.redis.exists(shareKey(uid))) === 1;
  }

  /** True if this update may proceed (one per LOCATION_MIN_INTERVAL_MS per user). */
  async takeRateSlot(uid: string): Promise<boolean> {
    return (await this.redis.set(rateKey(uid), '1', 'PX', LOCATION_MIN_INTERVAL_MS, 'NX')) === 'OK';
  }

  async save(loc: StoredLocation): Promise<void> {
    await this.redis
      .multi()
      .hset(locKey(loc.userId), { lat: String(loc.lat), lng: String(loc.lng), acc: String(loc.accuracy), ts: String(loc.ts) })
      .pexpire(locKey(loc.userId), LOCATION_TTL_MS)
      .del(offCampusKey(loc.userId))
      .exec();
  }

  /**
   * Records that the user is off campus and deletes their position. Returns
   * true only the first time (until they are back on campus), so friends are
   * told once rather than on every update.
   */
  async markOffCampus(uid: string): Promise<boolean> {
    const first = (await this.redis.set(offCampusKey(uid), '1', 'PX', LOCATION_TTL_MS, 'NX')) === 'OK';
    if (first) await this.redis.del(locKey(uid));
    return first;
  }

  async get(uid: string): Promise<StoredLocation | null> {
    return (await this.getMany([uid]))[0] ?? null;
  }

  /** Latest positions of the given users who are currently sharing. */
  async getMany(uids: string[]): Promise<StoredLocation[]> {
    if (uids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const uid of uids) pipeline.exists(shareKey(uid)).hgetall(locKey(uid));
    const res = (await pipeline.exec()) ?? [];
    const out: StoredLocation[] = [];
    uids.forEach((userId, i) => {
      const sharing = res[i * 2]?.[1] === 1;
      const h = res[i * 2 + 1]?.[1] as Record<string, string> | undefined;
      if (!sharing || !h?.lat) return;
      out.push({ userId, lat: Number(h.lat), lng: Number(h.lng), accuracy: Number(h.acc), ts: Number(h.ts) });
    });
    return out;
  }

  /**
   * Claims shares whose end time has passed. ZREM succeeds on exactly one
   * instance per user, so friends are notified once even with many instances.
   */
  async claimExpired(now = Date.now(), limit = 200): Promise<string[]> {
    const due = await this.redis.zrangebyscore(EXPIRY_SET, '-inf', now, 'LIMIT', 0, limit);
    const won: string[] = [];
    for (const uid of due) {
      if ((await this.redis.zrem(EXPIRY_SET, uid)) === 1) {
        await this.redis.del(shareKey(uid), locKey(uid), offCampusKey(uid));
        won.push(uid);
      }
    }
    return won;
  }
}
