import type { RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import type { Role } from '../constants/auth.js';
import { ErrorCode } from '../constants/errorCodes.js';
import type { SessionService } from '../services/sessionService.js';
import type { TokenService } from '../services/tokenService.js';
import { AppError } from '../utils/AppError.js';

export interface AuthContext {
  userId: string;
  userObjectId: Types.ObjectId;
  sessionId: string;
  sessionObjectId: Types.ObjectId;
  role: Role;
}

export const getAuth = (res: Response): AuthContext => {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw AppError.unauthenticated();
  return auth;
};

/**
 * Identity comes only from a verified access token. The session must not be on
 * the Redis revocation list; if Redis is down the request is refused (503).
 */
export const authenticate =
  (tokens: TokenService, sessions: SessionService): RequestHandler =>
  async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
    if (!match?.[1]) return next(AppError.unauthenticated());

    const claims = tokens.verifyAccess(match[1]);
    if (!Types.ObjectId.isValid(claims.sub) || !Types.ObjectId.isValid(claims.sid)) {
      return next(AppError.unauthenticated('Invalid access token'));
    }
    if (await sessions.isRevoked(claims.sid)) {
      return next(AppError.unauthenticated('Session has ended, sign in again', ErrorCode.SESSION_REVOKED));
    }
    res.locals.auth = {
      userId: claims.sub,
      userObjectId: new Types.ObjectId(claims.sub),
      sessionId: claims.sid,
      sessionObjectId: new Types.ObjectId(claims.sid),
      role: claims.role,
    } satisfies AuthContext;
    next();
  };

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (_req, res, next) => {
    const auth = getAuth(res);
    if (!roles.includes(auth.role)) return next(AppError.forbidden());
    next();
  };

/**
 * CSRF defence for cookie-authenticated endpoints. SameSite=Lax already stops
 * cross-site POSTs carrying the cookie; on top of that we require a custom
 * header (forces a CORS preflight that only allowed origins pass) and, when
 * the browser sends one, an allowed Origin.
 */
export const requireCsrfHeaders =
  (allowedOrigins: string[]): RequestHandler =>
  (req, _res, next) => {
    if (req.get('x-requested-with') !== 'vnav') {
      return next(AppError.forbidden('Missing X-Requested-With header', ErrorCode.CSRF_REJECTED));
    }
    const origin = req.get('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      return next(AppError.forbidden('Origin not allowed', ErrorCode.CSRF_REJECTED));
    }
    next();
  };
