import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import type { Config } from './config/env.js';
import type { Logger } from './observability/logger.js';
import { registerModels, type Models } from './models/index.js';
import { UserRepository } from './repositories/userRepository.js';
import { SessionRepository } from './repositories/sessionRepository.js';
import { SocialRepository } from './repositories/socialRepository.js';
import { PasswordResetRepository, VerificationCodeRepository } from './repositories/tokenRepositories.js';
import { AuditService } from './services/auditService.js';
import { AuthService } from './services/authService.js';
import { LoginThrottle } from './services/loginThrottle.js';
import { MailService, SmtpMailTransport, type MailTransport } from './services/mailService.js';
import { PasswordService } from './services/passwordService.js';
import { RateLimiter } from './services/rateLimiter.js';
import { SessionService } from './services/sessionService.js';
import { TokenService } from './services/tokenService.js';
import { EmailOtpVerifier } from './services/verificationService.js';
import { FriendService } from './services/friendService.js';
import { RelationshipCache } from './services/relationshipCache.js';

/** Runtime state shared by health checks and graceful shutdown. */
export interface Lifecycle {
  shuttingDown: boolean;
}

export interface Container {
  config: Config;
  logger: Logger;
  mongo: Connection;
  redis: Redis;
  models: Models;
  lifecycle: Lifecycle;
  repos: { users: UserRepository; social: SocialRepository };
  services: {
    tokens: TokenService;
    sessions: SessionService;
    limiter: RateLimiter;
    auth: AuthService;
    relationships: RelationshipCache;
    friends: FriendService;
  };
}

export interface ContainerOverrides {
  mailTransport?: MailTransport;
  passwordService?: PasswordService;
}

/** Composition root: the only place that wires concrete implementations together. */
export function buildContainer(
  config: Config,
  logger: Logger,
  mongo: Connection,
  redis: Redis,
  overrides: ContainerOverrides = {},
): Container {
  const models = registerModels(mongo);
  const users = new UserRepository(models);
  const sessionsRepo = new SessionRepository(models);
  const codes = new VerificationCodeRepository(models);
  const resets = new PasswordResetRepository(models);
  const social = new SocialRepository(models);

  const tokens = new TokenService(config.secrets.jwtAccess);
  const sessions = new SessionService(sessionsRepo, tokens, redis, config.secrets.ipHash);
  const limiter = new RateLimiter(redis);
  const mail = new MailService(overrides.mailTransport ?? new SmtpMailTransport(config.smtp, logger), config.appPublicUrl);
  const passwords = overrides.passwordService ?? new PasswordService();
  const verifier = new EmailOtpVerifier(codes, mail, config.secrets.otp);
  const audit = new AuditService(models, logger);

  const auth = new AuthService({
    users,
    resets,
    passwords,
    sessions,
    verifier,
    mail,
    limiter,
    throttle: new LoginThrottle(redis),
    audit,
    logger,
    allowedEmailDomains: config.allowedEmailDomains,
  });

  const relationships = new RelationshipCache(redis, social, logger);
  const friends = new FriendService({ mongo, users, social, cache: relationships, limiter, audit, logger });

  return {
    config,
    logger,
    mongo,
    redis,
    models,
    lifecycle: { shuttingDown: false },
    repos: { users, social },
    services: { tokens, sessions, limiter, auth, relationships, friends },
  };
}
