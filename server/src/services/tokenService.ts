import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL_SECONDS, ROLES, type Role } from '../constants/auth.js';
import { ErrorCode } from '../constants/errorCodes.js';
import { AppError } from '../utils/AppError.js';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
  iat: number;
  exp: number;
}

const ISSUER = 'vnav-api';
const AUDIENCE = 'vnav';

/** Short-lived HS256 access tokens. Refresh tokens are opaque and live in SessionService. */
export class TokenService {
  constructor(private readonly secret: string) {}

  signAccess(input: { userId: string; sessionId: string; role: Role }): { token: string; expiresAt: Date } {
    const token = jwt.sign({ sid: input.sessionId, role: input.role }, this.secret, {
      algorithm: 'HS256',
      subject: input.userId,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return { token, expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000) };
  }

  verifyAccess(token: string): AccessClaims {
    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(token, this.secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw AppError.unauthenticated('Access token expired', ErrorCode.TOKEN_EXPIRED);
      }
      throw AppError.unauthenticated('Invalid access token');
    }
    if (
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !ROLES.includes(payload.role) ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      throw AppError.unauthenticated('Invalid access token');
    }
    return { sub: payload.sub, sid: payload.sid, role: payload.role, iat: payload.iat, exp: payload.exp };
  }
}
