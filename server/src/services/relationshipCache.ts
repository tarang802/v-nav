import type { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { RELATION_CACHE_TTL_SECONDS } from '../constants/social.js';
import type { Logger } from '../observability/logger.js';
import type { SocialRepository } from '../repositories/socialRepository.js';

type Kind = 'friends' | 'blocks';

/** Marker member so an empty relationship list can still be cached (Redis drops empty sets). */
const EMPTY = '_';

/**
 * Writes a freshly loaded set only if no invalidation happened since the
 * reader started (generation unchanged). Without this, a reader that loaded
 * from MongoDB just before an unfriend commits could write the old friend list
 * back after the invalidation, and keep a removed friend authorised for up to
 * the cache TTL.
 */
const POPULATE = `
local current = redis.call('GET', KEYS[1]) or '0'
if current ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[2])
redis.call('SADD', KEYS[2], unpack(ARGV, 3))
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`;

const GEN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Redis cache of each user's friend ids and blocked-either-way ids.
 * MongoDB is the source of truth: a cache miss or a Redis error falls back to
 * MongoDB, so a Redis outage can never grant access that the database denies.
 * FriendService invalidates both users' entries after every committed change.
 */
export class RelationshipCache {
  constructor(
    private readonly redis: Redis,
    private readonly social: SocialRepository,
    private readonly logger: Logger,
  ) {}

  friendIds(userId: Types.ObjectId): Promise<Set<string>> {
    return this.load('friends', userId);
  }

  blockedEitherWay(userId: Types.ObjectId): Promise<Set<string>> {
    return this.load('blocks', userId);
  }

  async areFriends(a: Types.ObjectId, b: Types.ObjectId): Promise<boolean> {
    return (await this.friendIds(a)).has(b.toHexString());
  }

  async isBlockedEitherWay(a: Types.ObjectId, b: Types.ObjectId): Promise<boolean> {
    return (await this.blockedEitherWay(a)).has(b.toHexString());
  }

  /** Called after a committed friendship or block change. Never throws. */
  async invalidate(kinds: Kind[], userIds: Types.ObjectId[]): Promise<void> {
    const pipeline = this.redis.multi();
    for (const id of userIds) {
      for (const kind of kinds) {
        const gen = this.genKey(kind, id);
        pipeline.incr(gen).expire(gen, GEN_TTL_SECONDS).del(this.setKey(kind, id));
      }
    }
    try {
      await pipeline.exec();
    } catch (err) {
      // The database change is committed; the stale entry expires within the cache TTL.
      this.logger.error({ err, kinds }, 'relationship cache invalidation failed');
    }
  }

  private async load(kind: Kind, userId: Types.ObjectId): Promise<Set<string>> {
    const setKey = this.setKey(kind, userId);
    const genKey = this.genKey(kind, userId);
    let generation: string;
    try {
      const [[, members], [, gen]] = (await this.redis.multi().smembers(setKey).get(genKey).exec()) as [
        [Error | null, string[]],
        [Error | null, string | null],
      ];
      if (members.length > 0) return new Set(members.filter((m) => m !== EMPTY));
      generation = gen ?? '0';
    } catch (err) {
      this.logger.warn({ err, kind }, 'relationship cache read failed; using database');
      return this.fromDb(kind, userId);
    }

    const ids = await this.fromDb(kind, userId);
    try {
      await this.redis.eval(POPULATE, 2, genKey, setKey, generation, String(RELATION_CACHE_TTL_SECONDS), EMPTY, ...ids);
    } catch (err) {
      this.logger.warn({ err, kind }, 'relationship cache populate failed');
    }
    return ids;
  }

  private async fromDb(kind: Kind, userId: Types.ObjectId): Promise<Set<string>> {
    const ids = kind === 'friends' ? await this.social.allFriendIds(userId) : await this.social.allBlockedEitherWay(userId);
    return new Set(ids.map((id) => id.toHexString()));
  }

  private setKey(kind: Kind, id: Types.ObjectId) {
    return `${kind}:${id.toHexString()}`;
  }

  private genKey(kind: Kind, id: Types.ObjectId) {
    return `${kind}:gen:${id.toHexString()}`;
  }
}
