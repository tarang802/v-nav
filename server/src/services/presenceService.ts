import type { Redis } from 'ioredis';
import { PRESENCE_TTL_MS } from '../constants/location.js';

const key = (uid: string) => `presence:${uid}`;

/**
 * Upserts one socket's entry (value = its own expiry time), drops entries of
 * sockets that stopped refreshing (e.g. their instance crashed), and returns
 * the number of live sockets. Atomic, so exactly one of several tabs connecting
 * at once sees "1" and announces the user online.
 */
const ADD = `
local now = tonumber(ARGV[2])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
local all = redis.call('HGETALL', KEYS[1])
for i = 1, #all, 2 do
  if tonumber(all[i + 1]) < now then redis.call('HDEL', KEYS[1], all[i]) end
end
return redis.call('HLEN', KEYS[1])
`;

/** Removes one socket; returns { existed, remainingLiveSockets }. */
const REMOVE = `
local now = tonumber(ARGV[2])
local existed = redis.call('HDEL', KEYS[1], ARGV[1])
local all = redis.call('HGETALL', KEYS[1])
for i = 1, #all, 2 do
  if tonumber(all[i + 1]) < now then redis.call('HDEL', KEYS[1], all[i]) end
end
local left = redis.call('HLEN', KEYS[1])
if left == 0 then redis.call('DEL', KEYS[1]) end
return {existed, left}
`;

/**
 * Online presence across tabs, devices and instances: `presence:{uid}` is a
 * hash of socketId → expiry. A user is online while any entry is fresh. Each
 * instance refreshes its own sockets every 30 s; entries of a crashed instance
 * expire on their own within 90 s.
 */
export class PresenceService {
  constructor(private readonly redis: Redis) {}

  /** Returns true if this is the user's first live socket (they just came online). */
  async add(uid: string, socketId: string, now = Date.now()): Promise<boolean> {
    const count = (await this.redis.eval(ADD, 1, key(uid), socketId, String(now), String(now + PRESENCE_TTL_MS), String(PRESENCE_TTL_MS))) as number;
    return count === 1;
  }

  /** Returns true if this was the user's last live socket (they just went offline). */
  async remove(uid: string, socketId: string, now = Date.now()): Promise<boolean> {
    const [existed, left] = (await this.redis.eval(REMOVE, 1, key(uid), socketId, String(now))) as [number, number];
    return existed === 1 && left === 0;
  }

  /** Refreshes many sockets in one round trip. */
  async refresh(entries: { uid: string; socketId: string }[], now = Date.now()): Promise<void> {
    if (entries.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const e of entries) {
      pipeline.hset(key(e.uid), e.socketId, String(now + PRESENCE_TTL_MS)).pexpire(key(e.uid), PRESENCE_TTL_MS);
    }
    await pipeline.exec();
  }

  async isOnline(uid: string): Promise<boolean> {
    return (await this.redis.exists(key(uid))) === 1;
  }

  async onlineSet(uids: string[]): Promise<Set<string>> {
    if (uids.length === 0) return new Set();
    const pipeline = this.redis.pipeline();
    for (const uid of uids) pipeline.exists(key(uid));
    const res = (await pipeline.exec()) ?? [];
    return new Set(uids.filter((_, i) => res[i]?.[1] === 1));
  }
}
