import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectMongo } from '../../src/config/db.js';
import { loadConfig } from '../../src/config/env.js';
import { connectRedis } from '../../src/config/redis.js';
import { buildContainer, type Container } from '../../src/container.js';
import { syncAllIndexes } from '../../src/models/index.js';
import { createLogger } from '../../src/observability/logger.js';
import type { MailMessage, MailTransport } from '../../src/services/mailService.js';
import { PasswordService } from '../../src/services/passwordService.js';
import { TEST_ORIGIN, testEnv } from './env.js';

/**
 * Captures outgoing mail in memory. This replaces only the SMTP hop; codes and
 * links are generated and verified by the real services.
 */
export class CapturingMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  lastTo(to: string) {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
  codeFor(to: string): string {
    const m = this.lastTo(to);
    const code = m?.subject.match(/^(\d{6}) /)?.[1];
    if (!code) throw new Error(`no verification code mailed to ${to}`);
    return code;
  }
  resetTokenFor(to: string): string {
    const token = this.lastTo(to)?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
    if (!token) throw new Error(`no reset link mailed to ${to}`);
    return token;
  }
}

export interface TestContext {
  app: Express;
  container: Container;
  mail: CapturingMailTransport;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const config = loadConfig(testEnv);
  const logger = createLogger(config);
  const mongo = await connectMongo(config, logger);
  const redis = await connectRedis(config, logger);
  const mail = new CapturingMailTransport();
  // bcrypt cost 4 keeps the suite fast; cost 12 is covered by the unit test of the default.
  const container = buildContainer(config, logger, mongo, redis, {
    mailTransport: mail,
    passwordService: new PasswordService(4),
  });
  await syncAllIndexes(container.models);
  const app = createApp(container);

  return {
    app,
    container,
    mail,
    async reset() {
      await Promise.all(Object.values(container.models).map((m) => m.deleteMany({})));
      await redis.flushdb();
      mail.sent.length = 0;
    },
    async close() {
      await redis.quit();
      await mongo.close();
    },
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

export const api = (app: Express) => request(app);

/** Extracts `vnav_rt` from Set-Cookie, plus its attributes. */
export function refreshCookie(res: request.Response) {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('vnav_rt='));
  if (!raw) return null;
  const value = raw.split(';')[0]!.slice('vnav_rt='.length);
  return { raw, value, header: `vnav_rt=${value}` };
}

export const csrfHeaders = { 'X-Requested-With': 'vnav', Origin: TEST_ORIGIN };

let counter = 0;
export function newStudent(overrides: Partial<{ name: string; email: string; regNo: string; password: string }> = {}) {
  counter += 1;
  const n = String(1000 + (counter % 9000)).padStart(4, '0');
  return {
    name: `Test Student ${counter}`,
    email: `student${counter}.${Date.now()}@vitstudent.ac.in`,
    regNo: `23BCE${n}`,
    password: 'a long enough passphrase',
    ...overrides,
  };
}

/** Registers and verifies a student; returns tokens. */
export async function registerVerified(ctx: TestContext, overrides: Parameters<typeof newStudent>[0] = {}) {
  const s = newStudent(overrides);
  await api(ctx.app).post('/api/v1/auth/register').send(s).expect(202);
  const res = await api(ctx.app)
    .post('/api/v1/auth/verify-email')
    .send({ email: s.email, code: ctx.mail.codeFor(s.email) })
    .expect(200);
  return {
    student: s,
    accessToken: res.body.accessToken as string,
    user: res.body.user,
    cookie: refreshCookie(res)!,
  };
}
