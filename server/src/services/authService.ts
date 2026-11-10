import { Types } from 'mongoose';
import {
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  FRIEND_CODE_PREFIX,
  REFRESH_RACE_GRACE_MS,
  RESET_TOKEN_TTL_MS,
} from '../constants/auth.js';
import { ErrorCode } from '../constants/errorCodes.js';
import type { Logger } from '../observability/logger.js';
import type { UserRepository } from '../repositories/userRepository.js';
import type { PasswordResetRepository } from '../repositories/tokenRepositories.js';
import { AppError } from '../utils/AppError.js';
import { randomFromAlphabet, randomToken, sha256 } from '../utils/crypto.js';
import type { AuditService } from './auditService.js';
import type { LoginThrottle } from './loginThrottle.js';
import type { MailService } from './mailService.js';
import type { PasswordService } from './passwordService.js';
import { Limits, type RateLimiter } from './rateLimiter.js';
import type { ClientContext, SessionService } from './sessionService.js';
import { toSelfUser } from './userPresenter.js';
import type { StudentVerifier } from './verificationService.js';

export interface AuthDeps {
  users: UserRepository;
  resets: PasswordResetRepository;
  passwords: PasswordService;
  sessions: SessionService;
  verifier: StudentVerifier;
  mail: MailService;
  limiter: RateLimiter;
  throttle: LoginThrottle;
  audit: AuditService;
  logger: Logger;
  allowedEmailDomains: string[];
}

export interface AuthResult {
  user: ReturnType<typeof toSelfUser>;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
}

const isDuplicateKey = (err: unknown, field?: string): boolean => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e?.code === 11000 && (!field || Boolean(e.keyPattern && field in e.keyPattern));
};

const emailKey = (email: string) => sha256(email);

export class AuthService {
  constructor(private readonly d: AuthDeps) {}

  private assertAllowedDomain(email: string) {
    const domain = email.split('@')[1] ?? '';
    if (!this.d.allowedEmailDomains.includes(domain)) {
      throw AppError.forbidden(
        `Use your institutional email (${this.d.allowedEmailDomains.map((x) => '@' + x).join(', ')})`,
        ErrorCode.EMAIL_DOMAIN_NOT_ALLOWED,
      );
    }
  }

  private async limitMail(email: string, ip: string) {
    await this.d.limiter.consume(Limits.mailIp, ip);
    await this.d.limiter.consume(Limits.mailEmailMinute, emailKey(email));
    await this.d.limiter.consume(Limits.mailEmailHour, emailKey(email));
  }

  private async sendCode(user: { _id: Types.ObjectId; email: string; name: string }) {
    try {
      await this.d.verifier.issue(user);
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.d.logger.error({ err }, 'verification email failed');
      throw AppError.unavailable('Could not send the verification email. Try "resend code" in a minute.');
    }
  }

  // ── Registration and verification ────────────────────────────────────────

  async register(
    input: { name: string; email: string; regNo: string; password: string },
    ctx: ClientContext,
  ): Promise<{ email: string; verificationRequired: true }> {
    await this.d.limiter.consume(Limits.registerIp, ctx.ip);
    this.assertAllowedDomain(input.email);
    this.d.passwords.assertStrong(input.password, input);

    const existing = await this.d.users.findByEmail(input.email);
    if (existing && existing.status !== 'pending_verification') {
      throw AppError.conflict(ErrorCode.EMAIL_TAKEN, 'An account with this email already exists');
    }
    if (await this.d.users.existsActiveWithRegNo(input.regNo)) {
      throw AppError.conflict(ErrorCode.REG_NO_TAKEN, 'This registration number is already verified on another account');
    }

    await this.limitMail(input.email, ctx.ip);
    const passwordHash = await this.d.passwords.hash(input.password);

    let user: { _id: Types.ObjectId; email: string; name: string };
    if (existing) {
      // Unverified account: whoever controls the mailbox wins, so overwriting is safe.
      await this.d.users.updatePending(existing._id, { name: input.name, regNo: input.regNo, passwordHash });
      user = { _id: existing._id, email: existing.email, name: input.name };
    } else {
      user = await this.createWithFriendCode({ ...input, passwordHash });
      await this.d.audit.record({ action: 'register', actorId: user._id, ipHash: this.d.sessions.hashIp(ctx.ip) });
    }

    await this.sendCode(user);
    return { email: user.email, verificationRequired: true };
  }

  private async createWithFriendCode(data: { name: string; email: string; regNo: string; passwordHash: string }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const friendCode = FRIEND_CODE_PREFIX + randomFromAlphabet(FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH);
      try {
        return await this.d.users.create({ ...data, friendCode });
      } catch (err) {
        if (isDuplicateKey(err, 'friendCode')) continue;
        if (isDuplicateKey(err, 'email')) {
          throw AppError.conflict(ErrorCode.EMAIL_TAKEN, 'An account with this email already exists');
        }
        throw err;
      }
    }
    throw new Error('Could not allocate a unique friend code after 5 attempts');
  }

  async verifyEmail(input: { email: string; code: string }, ctx: ClientContext): Promise<AuthResult> {
    await this.d.limiter.consume(Limits.verifyIp, ctx.ip);
    const invalid = () => new AppError(400, ErrorCode.INVALID_CODE, 'The code is invalid or has expired');

    const user = await this.d.users.findByEmail(input.email);
    if (!user || user.status !== 'pending_verification') throw invalid();
    if (!(await this.d.verifier.verify(user._id, input.code))) throw invalid();

    if (await this.d.users.existsActiveWithRegNo(user.regNo, user._id)) {
      throw AppError.conflict(ErrorCode.REG_NO_TAKEN, 'This registration number is already verified on another account');
    }
    let active;
    try {
      active = await this.d.users.activate(user._id);
    } catch (err) {
      if (isDuplicateKey(err, 'regNo')) {
        throw AppError.conflict(ErrorCode.REG_NO_TAKEN, 'This registration number is already verified on another account');
      }
      throw err;
    }
    if (!active) throw invalid();

    await this.d.audit.record({ action: 'email_verified', actorId: user._id, ipHash: this.d.sessions.hashIp(ctx.ip) });
    return this.startSession(active, ctx);
  }

  /** Always resolves the same way whether or not the account exists. */
  async resendVerification(email: string, ctx: ClientContext): Promise<void> {
    await this.limitMail(email, ctx.ip);
    const user = await this.d.users.findByEmail(email);
    if (!user || user.status !== 'pending_verification') return;
    try {
      await this.d.verifier.issue(user);
    } catch (err) {
      this.d.logger.error({ err }, 'verification resend failed');
    }
  }

  // ── Login and sessions ───────────────────────────────────────────────────

  async login(input: { email: string; password: string }, ctx: ClientContext): Promise<AuthResult> {
    await this.d.limiter.consume(Limits.loginIp, ctx.ip);
    await this.d.limiter.consume(Limits.loginIpEmail, `${ctx.ip}:${emailKey(input.email)}`);

    const lockedFor = await this.d.throttle.lockedFor(input.email);
    if (lockedFor > 0) {
      throw new AppError(429, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts. Try again later.', undefined, {
        'Retry-After': String(lockedFor),
      });
    }

    const user = await this.d.users.findByEmailWithHash(input.email);
    const ok = await this.d.passwords.verify(input.password, user?.passwordHash);
    const ipHash = this.d.sessions.hashIp(ctx.ip);

    if (!user || !ok) {
      const lockSeconds = await this.d.throttle.recordFailure(input.email);
      await this.d.audit.record({ action: 'login_failed', actorId: user?._id ?? null, ipHash });
      if (lockSeconds > 0 && user) {
        await this.d.audit.record({ action: 'account_locked', actorId: user._id, ipHash, meta: { seconds: lockSeconds } });
      }
      throw AppError.unauthenticated('Email or password is incorrect', ErrorCode.INVALID_CREDENTIALS);
    }

    await this.d.throttle.clear(input.email);
    if (user.status === 'pending_verification') {
      throw AppError.forbidden('Verify your email before signing in', ErrorCode.EMAIL_NOT_VERIFIED);
    }
    if (user.status === 'suspended') {
      throw AppError.forbidden('This account is suspended', ErrorCode.ACCOUNT_SUSPENDED);
    }

    await this.d.audit.record({ action: 'login_success', actorId: user._id, ipHash });
    const { passwordHash: _omit, ...safe } = user;
    return this.startSession(safe, ctx);
  }

  private async startSession(user: Parameters<typeof toSelfUser>[0], ctx: ClientContext): Promise<AuthResult> {
    const issued = await this.d.sessions.create(user, ctx);
    return {
      user: toSelfUser(user),
      accessToken: issued.accessToken,
      accessTokenExpiresAt: issued.accessTokenExpiresAt,
      refreshToken: issued.refreshToken,
    };
  }

  async refresh(refreshToken: string, ctx: ClientContext) {
    await this.d.limiter.consume(Limits.refreshIp, ctx.ip);
    const rotated = await this.d.sessions.rotate(refreshToken);

    if (!rotated) {
      const current = await this.d.sessions.findByToken(refreshToken);
      if (current) {
        // Revoked or expired.
        throw AppError.unauthenticated('Session has ended, sign in again', ErrorCode.SESSION_REVOKED);
      }
      const previous = await this.d.sessions.findByPreviousToken(refreshToken);
      if (previous && !previous.revokedAt) {
        const rotatedAgo = previous.rotatedAt ? Date.now() - previous.rotatedAt.getTime() : Infinity;
        if (rotatedAgo <= REFRESH_RACE_GRACE_MS) {
          // Two tabs refreshed at once; the other one already holds the new cookie. Retry, do not revoke.
          throw AppError.unauthenticated('Refresh already in progress, retry', ErrorCode.REFRESH_CONFLICT);
        }
        // An old token came back after rotation: assume it was stolen and kill the whole family
        // (one session document holds the family; other devices are unaffected).
        await this.d.sessions.revokeOne(previous.userId, previous._id, 'token_reuse');
        await this.d.audit.record({
          action: 'token_reuse_detected',
          actorId: previous.userId,
          targetId: previous._id,
          ipHash: this.d.sessions.hashIp(ctx.ip),
        });
        throw AppError.unauthenticated('Session has ended, sign in again', ErrorCode.SESSION_REVOKED);
      }
      throw AppError.unauthenticated('Session has ended, sign in again', ErrorCode.SESSION_REVOKED);
    }

    const { session } = rotated;
    const user = await this.d.users.findById(session.userId);
    if (!user || user.status !== 'active') {
      await this.d.sessions.revokeOne(session.userId, session._id, 'user_inactive');
      throw AppError.unauthenticated('Session has ended, sign in again', ErrorCode.SESSION_REVOKED);
    }
    const access = this.d.sessions.issueAccess(user._id, session._id, user.role);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: rotated.refreshToken,
      user: toSelfUser(user),
    };
  }

  /** Idempotent: an unknown or already-revoked token still results in a clean logout. */
  async logout(refreshToken: string | undefined, ctx: ClientContext): Promise<void> {
    if (!refreshToken) return;
    const session =
      (await this.d.sessions.findByToken(refreshToken)) ?? (await this.d.sessions.findByPreviousToken(refreshToken));
    if (!session) return;
    if (await this.d.sessions.revokeOne(session.userId, session._id, 'logout')) {
      await this.d.audit.record({ action: 'logout', actorId: session.userId, ipHash: this.d.sessions.hashIp(ctx.ip) });
    }
  }

  async logoutAll(userId: Types.ObjectId, ctx: ClientContext): Promise<void> {
    await this.d.sessions.revokeAll(userId, 'logout_all');
    await this.d.audit.record({ action: 'logout_all', actorId: userId, ipHash: this.d.sessions.hashIp(ctx.ip) });
  }

  async listSessions(userId: Types.ObjectId, currentSessionId: string) {
    const items = await this.d.sessions.listActive(userId);
    return items.map((s) => ({
      id: s._id.toHexString(),
      userAgent: s.userAgent,
      createdAt: (s as typeof s & { createdAt?: Date }).createdAt ?? null,
      lastUsedAt: s.lastUsedAt,
      current: s._id.toHexString() === currentSessionId,
    }));
  }

  async revokeSession(userId: Types.ObjectId, sessionId: string, ctx: ClientContext): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) throw AppError.notFound('Session not found');
    // Scoped by userId: another user's session id behaves exactly like a missing one.
    const revoked = await this.d.sessions.revokeOne(userId, new Types.ObjectId(sessionId), 'revoked_by_user');
    if (!revoked) throw AppError.notFound('Session not found');
    await this.d.audit.record({
      action: 'session_revoked',
      actorId: userId,
      targetId: new Types.ObjectId(sessionId),
      ipHash: this.d.sessions.hashIp(ctx.ip),
    });
  }

  // ── Passwords ────────────────────────────────────────────────────────────

  /** Always resolves the same way whether or not the account exists. */
  async forgotPassword(email: string, ctx: ClientContext): Promise<void> {
    await this.d.limiter.consume(Limits.mailIp, ctx.ip);
    await this.d.limiter.consume(Limits.forgotEmailHour, emailKey(email));
    const user = await this.d.users.findByEmail(email);
    if (!user || user.status !== 'active') return;

    const token = randomToken(32);
    await this.d.resets.create(user._id, sha256(token), new Date(Date.now() + RESET_TOKEN_TTL_MS));
    await this.d.audit.record({ action: 'password_reset_requested', actorId: user._id, ipHash: this.d.sessions.hashIp(ctx.ip) });
    try {
      await this.d.mail.sendPasswordReset(user.email, user.name, token, RESET_TOKEN_TTL_MS / 60_000);
    } catch (err) {
      this.d.logger.error({ err }, 'password reset email failed');
    }
  }

  async resetPassword(input: { token: string; password: string }, ctx: ClientContext): Promise<void> {
    await this.d.limiter.consume(Limits.verifyIp, ctx.ip);
    const tokenHash = sha256(input.token);
    const invalid = () => new AppError(400, ErrorCode.INVALID_TOKEN, 'This reset link is invalid or has expired');
    const pending = await this.d.resets.findValid(tokenHash);
    if (!pending) throw invalid();
    const user = await this.d.users.findById(pending.userId);
    if (!user || user.status !== 'active') throw invalid();

    // Check strength before consuming, so a rejected password does not burn the link.
    this.d.passwords.assertStrong(input.password, user);
    // Atomic single use: of two concurrent resets with the same link, only one gets here.
    if (!(await this.d.resets.consume(tokenHash))) throw invalid();
    await this.d.users.setPassword(user._id, await this.d.passwords.hash(input.password));
    await this.d.sessions.revokeAll(user._id, 'password_reset');
    await this.d.throttle.clear(user.email);
    await this.d.audit.record({ action: 'password_reset', actorId: user._id, ipHash: this.d.sessions.hashIp(ctx.ip) });
  }

  async changePassword(
    userId: Types.ObjectId,
    currentSessionId: Types.ObjectId,
    input: { currentPassword: string; newPassword: string },
    ctx: ClientContext,
  ): Promise<void> {
    const user = await this.d.users.findByIdWithHash(userId);
    if (!user) throw AppError.unauthenticated();
    if (!(await this.d.passwords.verify(input.currentPassword, user.passwordHash))) {
      throw AppError.unauthenticated('Current password is incorrect', ErrorCode.INVALID_CREDENTIALS);
    }
    if (input.currentPassword === input.newPassword) {
      throw new AppError(400, ErrorCode.WEAK_PASSWORD, 'New password must be different from the current one');
    }
    this.d.passwords.assertStrong(input.newPassword, user);
    await this.d.users.setPassword(user._id, await this.d.passwords.hash(input.newPassword));
    await this.d.sessions.revokeAll(user._id, 'password_changed', currentSessionId);
    await this.d.audit.record({ action: 'password_changed', actorId: user._id, ipHash: this.d.sessions.hashIp(ctx.ip) });
  }
}
