import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createTestContext, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  ctx.container.lifecycle.shuttingDown = false;
});

describe('operational endpoints', () => {
  it('/health answers without touching dependencies', async () => {
    expect((await api(ctx.app).get('/health').expect(200)).body).toEqual({ status: 'ok' });
  });

  it('/ready checks MongoDB and Redis', async () => {
    const res = await api(ctx.app).get('/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready', checks: { mongo: 'ok', redis: 'ok' } });
  });

  it('/ready returns 503 while shutting down', async () => {
    ctx.container.lifecycle.shuttingDown = true;
    await api(ctx.app).get('/ready').expect(503);
  });
});

describe('HTTP conventions', () => {
  it('returns the standard error shape with a request id for unknown routes', async () => {
    const res = await api(ctx.app).get('/api/v1/nope').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: res.headers['x-request-id'] });
  });

  it('propagates a well-formed upstream request id and ignores a malformed one', async () => {
    const ok = await api(ctx.app).get('/api/v1/nope').set('X-Request-Id', 'nginx-abc12345');
    expect(ok.headers['x-request-id']).toBe('nginx-abc12345');
    const bad = await api(ctx.app).get('/api/v1/nope').set('X-Request-Id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  it('maps malformed JSON to 400 and oversize bodies to 413', async () => {
    const bad = await api(ctx.app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const big = await api(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@vitstudent.ac.in', password: 'x'.repeat(200 * 1024) })
      .expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await api(ctx.app).get('/api/v1/nope');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows CORS with credentials only for configured origins', async () => {
    const ok = await api(ctx.app).options('/api/v1/auth/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await api(ctx.app).options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Redis-backed rate limits', () => {
  it('counts across requests and reports Retry-After', async () => {
    const { limiter } = ctx.container.services;
    const rule = { name: 'test', limit: 3, windowSeconds: 30 };
    for (let i = 0; i < 3; i++) expect((await limiter.hit(rule, 'k')).allowed).toBe(true);
    const blocked = await limiter.hit(rule, 'k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(await ctx.container.redis.pttl('rl:test:k')).toBeGreaterThan(0);
  });
});
