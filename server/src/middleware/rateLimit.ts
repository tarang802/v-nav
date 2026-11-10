import type { RequestHandler } from 'express';
import { Limits, type RateLimiter } from '../services/rateLimiter.js';
import type { AuthContext } from './auth.js';

/**
 * Global limit: per user when authenticated (set by `authenticate`), otherwise
 * per IP. Route-specific limits are applied inside the services.
 */
export const globalIpLimit =
  (limiter: RateLimiter): RequestHandler =>
  async (req, _res, next) => {
    await limiter.consume(Limits.globalIp, req.ip ?? 'unknown');
    next();
  };

export const globalUserLimit =
  (limiter: RateLimiter): RequestHandler =>
  async (_req, res, next) => {
    const auth = res.locals.auth as AuthContext | undefined;
    if (auth) await limiter.consume(Limits.globalUser, auth.userId);
    next();
  };
