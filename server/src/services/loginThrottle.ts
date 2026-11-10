import type { Redis } from 'ioredis';
import {
  LOGIN_FAILURE_WINDOW_SECONDS,
  LOGIN_LOCK_BASE_SECONDS,
  LOGIN_LOCK_MAX_SECONDS,
  LOGIN_MAX_FAILURES,
} from '../constants/auth.js';
import { sha256 } from '../utils/crypto.js';

/**
 * Progressive account lockout keyed by the *email* (hashed), not the user id,
 * so that unknown emails lock exactly like real ones and lockout behaviour
 * cannot be used to discover which accounts exist.
 */
export class LoginThrottle {
  constructor(private readonly redis: Redis) {}

  private keys(email: string) {
    const h = sha256(email.toLowerCase());
    return { fail: `login:fail:${h}`, lock: `login:lock:${h}`, lockouts: `login:lockouts:${h}` };
  }

  /** Seconds remaining on a lock, or 0. */
  async lockedFor(email: string): Promise<number> {
    const ttl = await this.redis.ttl(this.keys(email).lock);
    return ttl > 0 ? ttl : 0;
  }

  /** Records a failure; returns the lock duration in seconds if this failure triggered a lock, else 0. */
  async recordFailure(email: string): Promise<number> {
    const k = this.keys(email);
    const [[, count]] = (await this.redis
      .multi()
      .incr(k.fail)
      .expire(k.fail, LOGIN_FAILURE_WINDOW_SECONDS, 'NX')
      .exec()) as [[null, number], [null, number]];
    if (count < LOGIN_MAX_FAILURES) return 0;

    const lockouts = await this.redis.incr(k.lockouts);
    await this.redis.expire(k.lockouts, 24 * 60 * 60);
    const seconds = Math.min(LOGIN_LOCK_BASE_SECONDS * 2 ** (lockouts - 1), LOGIN_LOCK_MAX_SECONDS);
    await this.redis.multi().set(k.lock, '1', 'EX', seconds).del(k.fail).exec();
    return seconds;
  }

  async clear(email: string): Promise<void> {
    const k = this.keys(email);
    await this.redis.del(k.fail, k.lockouts);
  }
}
