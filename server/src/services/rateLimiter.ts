import type { Redis } from 'ioredis';
import { AppError } from '../utils/AppError.js';

/**
 * Fixed-window counter in Redis, shared by every API instance.
 * INCR + PEXPIRE run atomically in one Lua script so a crash can never leave
 * a counter without a TTL.
 */
const SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {n, ttl}
`;

export interface LimitRule {
  /** Logical name, part of the Redis key. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(rule: LimitRule, subject: string): Promise<LimitResult> {
    const key = `rl:${rule.name}:${subject}`;
    const [count, ttl] = (await this.redis.eval(SCRIPT, 1, key, String(rule.windowSeconds * 1000))) as [
      number,
      number,
    ];
    const retryAfterSeconds = Math.max(1, Math.ceil((ttl > 0 ? ttl : rule.windowSeconds * 1000) / 1000));
    return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterSeconds };
  }

  /** Throws 429 when the limit is exceeded. Fails closed (503) if Redis is unavailable. */
  async consume(rule: LimitRule, subject: string): Promise<void> {
    let result: LimitResult;
    try {
      result = await this.hit(rule, subject);
    } catch {
      throw AppError.unavailable();
    }
    if (!result.allowed) throw AppError.rateLimited(result.retryAfterSeconds);
  }

  async reset(rule: LimitRule, subject: string): Promise<void> {
    await this.redis.del(`rl:${rule.name}:${subject}`);
  }
}

/**
 * Limits from docs/API_DOCUMENTATION.md §9.
 * Per-IP limits are deliberately loose: most students reach the API through a
 * handful of campus NAT addresses, so one IP can be hundreds of real users.
 * The tight limits are per email / per user, where they cannot hurt bystanders.
 */
export const Limits = {
  globalIp: { name: 'ip', limit: 600, windowSeconds: 60 },
  globalUser: { name: 'user', limit: 300, windowSeconds: 60 },
  loginIpEmail: { name: 'login:ipemail', limit: 10, windowSeconds: 15 * 60 },
  loginIp: { name: 'login:ip', limit: 300, windowSeconds: 15 * 60 },
  registerIp: { name: 'register:ip', limit: 30, windowSeconds: 60 * 60 },
  verifyIp: { name: 'verify:ip', limit: 100, windowSeconds: 60 * 60 },
  mailEmailMinute: { name: 'mail:email:m', limit: 1, windowSeconds: 60 },
  mailEmailHour: { name: 'mail:email:h', limit: 5, windowSeconds: 60 * 60 },
  mailIp: { name: 'mail:ip', limit: 60, windowSeconds: 60 * 60 },
  forgotEmailHour: { name: 'forgot:email:h', limit: 3, windowSeconds: 60 * 60 },
  refreshIp: { name: 'refresh:ip', limit: 60, windowSeconds: 60 },
  lookupUser: { name: 'lookup:user', limit: 60, windowSeconds: 60 * 60 },
  friendRequestUser: { name: 'friendreq:user', limit: 30, windowSeconds: 60 * 60 },
} satisfies Record<string, LimitRule>;
