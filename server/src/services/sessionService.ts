import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import { ACCESS_TOKEN_TTL_SECONDS, SESSION_IDLE_TTL_MS, type Role } from '../constants/auth.js';
import type { Session } from '../models/Session.js';
import type { SessionRepository } from '../repositories/sessionRepository.js';
import { AppError } from '../utils/AppError.js';
import { hmacSha256, randomToken, sha256 } from '../utils/crypto.js';
import type { TokenService } from './tokenService.js';

export interface IssuedSession {
  session: Session;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}

export interface ClientContext {
  userAgent: string;
  ip: string;
}

const revokedKey = (sid: string) => `session:revoked:${sid}`;

/**
 * Refresh sessions (MongoDB) plus the revocation denylist (Redis) that makes
 * still-valid access tokens of revoked sessions stop working immediately.
 */
export class SessionService {
  /** Hook for Phase 4: disconnect sockets of revoked sessions. */
  onRevoked: (userId: Types.ObjectId, sessionIds: Types.ObjectId[], reason: string) => void = () => {};

  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly redis: Redis,
    private readonly ipHashSecret: string,
  ) {}

  hashIp(ip: string) {
    return hmacSha256(this.ipHashSecret, ip || 'unknown');
  }

  static hashRefresh(token: string) {
    return sha256(token);
  }

  async create(user: { _id: Types.ObjectId; role: Role }, ctx: ClientContext): Promise<IssuedSession> {
    const refreshToken = randomToken(32);
    const session = await this.sessions.create({
      userId: user._id,
      familyId: randomUUID(),
      tokenHash: SessionService.hashRefresh(refreshToken),
      userAgent: ctx.userAgent.slice(0, 200),
      ipHash: this.hashIp(ctx.ip),
      expiresAt: new Date(Date.now() + SESSION_IDLE_TTL_MS),
    });
    const access = this.tokens.signAccess({
      userId: user._id.toHexString(),
      sessionId: session._id.toHexString(),
      role: user.role,
    });
    return { session, refreshToken, accessToken: access.token, accessTokenExpiresAt: access.expiresAt };
  }

  /** Returns the rotated session and new plaintext token, or null if the presented token is not current. */
  async rotate(refreshToken: string): Promise<{ session: Session; refreshToken: string } | null> {
    const next = randomToken(32);
    const session = await this.sessions.rotate(
      SessionService.hashRefresh(refreshToken),
      SessionService.hashRefresh(next),
      new Date(Date.now() + SESSION_IDLE_TTL_MS),
    );
    return session ? { session, refreshToken: next } : null;
  }

  issueAccess(userId: Types.ObjectId, sessionId: Types.ObjectId, role: Role) {
    return this.tokens.signAccess({ userId: userId.toHexString(), sessionId: sessionId.toHexString(), role });
  }

  async revokeOne(userId: Types.ObjectId, sessionId: Types.ObjectId, reason: string): Promise<boolean> {
    const ids = await this.sessions.revoke({ _id: sessionId, userId }, reason);
    await this.denylist(ids);
    if (ids.length) this.onRevoked(userId, ids, reason);
    return ids.length > 0;
  }

  async revokeAll(userId: Types.ObjectId, reason: string, exceptSessionId?: Types.ObjectId): Promise<number> {
    const ids = await this.sessions.revoke(
      { userId, ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}) },
      reason,
    );
    await this.denylist(ids);
    if (ids.length) this.onRevoked(userId, ids, reason);
    return ids.length;
  }

  /** Revoked access tokens stay denied until they would have expired anyway. */
  private async denylist(ids: Types.ObjectId[]) {
    if (ids.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.set(revokedKey(id.toHexString()), '1', 'EX', ACCESS_TOKEN_TTL_SECONDS + 60);
    const results = await pipeline.exec();
    if (!results || results.some(([err]) => err)) {
      // MongoDB already has revokedAt, so refresh is blocked; but access tokens would live on. Surface it.
      throw AppError.unavailable('Could not complete sign-out, please retry');
    }
  }

  /** Fails closed: if Redis cannot answer, the request is refused rather than trusted. */
  async isRevoked(sessionId: string): Promise<boolean> {
    try {
      return (await this.redis.exists(revokedKey(sessionId))) === 1;
    } catch {
      throw AppError.unavailable();
    }
  }

  listActive(userId: Types.ObjectId) {
    return this.sessions.listActiveForUser(userId);
  }

  findByToken(refreshToken: string) {
    return this.sessions.findByTokenHash(SessionService.hashRefresh(refreshToken));
  }

  findByPreviousToken(refreshToken: string) {
    return this.sessions.findByPreviousTokenHash(SessionService.hashRefresh(refreshToken));
  }
}
