import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createTestContext,
  csrfHeaders,
  newStudent,
  refreshCookie,
  registerVerified,
  type TestContext,
} from '../helpers/testApp.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

const post = (path: string) => api(ctx.app).post(`/api/v1${path}`);

describe('registration', () => {
  it('creates a pending account and emails a 6-digit code', async () => {
    const s = newStudent();
    const res = await post('/auth/register').send(s).expect(202);
    expect(res.body).toEqual({ email: s.email, verificationRequired: true });
    expect(ctx.mail.codeFor(s.email)).toMatch(/^\d{6}$/);

    const user = await ctx.container.models.User.findOne({ email: s.email }).select('+passwordHash').lean();
    expect(user?.status).toBe('pending_verification');
    expect(user?.passwordHash).toMatch(/^\$2b\$/);
    expect(user?.friendCode).toMatch(/^VNAV-[0-9A-HJKMNP-TV-Z]{5}$/);
    // The plaintext code is never stored.
    const code = await ctx.container.models.VerificationCode.findOne({ userId: user!._id }).lean();
    expect(code?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(code?.codeHash).not.toContain(ctx.mail.codeFor(s.email));
  });

  it('rejects non-institutional email domains', async () => {
    const res = await post('/auth/register').send(newStudent({ email: 'someone@gmail.com' })).expect(403);
    expect(res.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(ctx.mail.sent).toHaveLength(0);
  });

  it('rejects weak passwords', async () => {
    const res = await post('/auth/register').send(newStudent({ password: 'password123' })).expect(400);
    expect(res.body.error.code).toBe('WEAK_PASSWORD');
  });

  it('validates input strictly and blocks operator injection', async () => {
    const s = newStudent();
    const inj = await post('/auth/register').send({ ...s, email: { $gt: '' } }).expect(400);
    expect(inj.body.error.code).toBe('VALIDATION_ERROR');
    const extra = await post('/auth/register').send({ ...s, role: 'admin' }).expect(400);
    expect(extra.body.error.details[0].path).toBe('body');
    const badReg = await post('/auth/register').send({ ...s, regNo: 'ABC' }).expect(400);
    expect(badReg.body.error.details[0].path).toBe('body.regNo');
  });

  it('rejects an email that already belongs to a verified account', async () => {
    const { student } = await registerVerified(ctx);
    const res = await post('/auth/register').send({ ...newStudent(), email: student.email }).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('lets a still-unverified registration be redone (mailbox owner wins)', async () => {
    const s = newStudent();
    await post('/auth/register').send(s).expect(202);
    const first = ctx.mail.codeFor(s.email);
    await ctx.container.redis.flushdb(); // clear the 1/min mail limit
    await post('/auth/register').send({ ...s, name: 'Corrected Name' }).expect(202);
    const second = ctx.mail.codeFor(s.email);
    // Old code no longer works (statistically: allow the 1-in-a-million equal case).
    if (first !== second) {
      await post('/auth/verify-email').send({ email: s.email, code: first }).expect(400);
    }
    const ok = await post('/auth/verify-email').send({ email: s.email, code: second }).expect(200);
    expect(ok.body.user.name).toBe('Corrected Name');
    expect(await ctx.container.models.User.countDocuments({ email: s.email })).toBe(1);
  });

  it('allows only one verified account per registration number', async () => {
    const a = newStudent({ regNo: '22BCE4242' });
    const b = newStudent({ regNo: '22BCE4242' });
    await post('/auth/register').send(a).expect(202);
    await post('/auth/register').send(b).expect(202); // pending squatters do not block each other
    await post('/auth/verify-email').send({ email: a.email, code: ctx.mail.codeFor(a.email) }).expect(200);
    const res = await post('/auth/verify-email').send({ email: b.email, code: ctx.mail.codeFor(b.email) }).expect(409);
    expect(res.body.error.code).toBe('REG_NO_TAKEN');
    const again = await post('/auth/register').send(newStudent({ regNo: '22BCE4242' })).expect(409);
    expect(again.body.error.code).toBe('REG_NO_TAKEN');
  });
});

describe('email verification', () => {
  it('activates the account, returns an access token and sets a hardened refresh cookie', async () => {
    const s = newStudent();
    await post('/auth/register').send(s).expect(202);
    const res = await post('/auth/verify-email').send({ email: s.email, code: ctx.mail.codeFor(s.email) }).expect(200);

    expect(res.body.user).toMatchObject({ email: s.email, status: 'active', isVerified: true, role: 'student' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = refreshCookie(res)!;
    expect(cookie.raw).toMatch(/HttpOnly/);
    expect(cookie.raw).toMatch(/Secure/);
    expect(cookie.raw).toMatch(/SameSite=Lax/);
    expect(cookie.raw).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('locks a code after 5 wrong attempts, even if the right code is sent next', async () => {
    const s = newStudent();
    await post('/auth/register').send(s).expect(202);
    const code = ctx.mail.codeFor(s.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await post('/auth/verify-email').send({ email: s.email, code: wrong }).expect(400);
      expect(r.body.error.code).toBe('INVALID_CODE');
    }
    await post('/auth/verify-email').send({ email: s.email, code }).expect(400);
  });

  it('gives the same answer for unknown emails (no account enumeration)', async () => {
    const r = await post('/auth/verify-email').send({ email: 'nobody@vitstudent.ac.in', code: '123456' }).expect(400);
    expect(r.body.error.code).toBe('INVALID_CODE');
  });

  it('resend answers 202 whether or not the account exists, and is rate-limited per email', async () => {
    await post('/auth/resend-verification').send({ email: 'nobody@vitstudent.ac.in' }).expect(202);
    expect(ctx.mail.sent).toHaveLength(0);

    const s = newStudent();
    await post('/auth/register').send(s).expect(202);
    const limited = await post('/auth/resend-verification').send({ email: s.email }).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('login', () => {
  it('signs in a verified user', async () => {
    const { student } = await registerVerified(ctx);
    const res = await post('/auth/login').send({ email: student.email.toUpperCase(), password: student.password }).expect(200);
    expect(res.body.user.email).toBe(student.email);
    expect(refreshCookie(res)).not.toBeNull();
  });

  it('uses one generic error for wrong password and unknown email', async () => {
    const { student } = await registerVerified(ctx);
    const a = await post('/auth/login').send({ email: student.email, password: 'wrong password!!' }).expect(401);
    const b = await post('/auth/login').send({ email: 'ghost@vitstudent.ac.in', password: 'wrong password!!' }).expect(401);
    expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(b.body.error).toMatchObject({ code: a.body.error.code, message: a.body.error.message });
  });

  it('refuses unverified accounts only after the password is proven', async () => {
    const s = newStudent();
    await post('/auth/register').send(s).expect(202);
    expect((await post('/auth/login').send({ email: s.email, password: 'not the password' }).expect(401)).body.error.code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((await post('/auth/login').send({ email: s.email, password: s.password }).expect(403)).body.error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
  });

  it('locks the email after 5 failures, for real and unknown accounts alike', async () => {
    const { student } = await registerVerified(ctx);
    for (const email of [student.email, 'ghost@vitstudent.ac.in']) {
      for (let i = 0; i < 5; i++) await post('/auth/login').send({ email, password: 'wrong password!!' }).expect(401);
    }
    const locked = await post('/auth/login').send({ email: student.email, password: student.password }).expect(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(800);
    const ghost = await post('/auth/login').send({ email: 'ghost@vitstudent.ac.in', password: 'x' }).expect(429);
    expect(ghost.body.error.code).toBe('ACCOUNT_LOCKED');

    const actions = await ctx.container.models.AuditLog.distinct('action');
    expect(actions).toEqual(expect.arrayContaining(['login_failed', 'account_locked']));
  });
});

describe('access tokens', () => {
  it('protects endpoints and identifies the caller only from the token', async () => {
    const { accessToken, student } = await registerVerified(ctx);
    await api(ctx.app).get('/api/v1/users/me').expect(401);
    await api(ctx.app).get('/api/v1/users/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
    const me = await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(me.body.user.email).toBe(student.email);
  });
});

describe('refresh token rotation', () => {
  it('rotates the cookie on every refresh', async () => {
    const { cookie } = await registerVerified(ctx);
    const res = await post('/auth/refresh').set(csrfHeaders).set('Cookie', cookie.header).expect(200);
    const next = refreshCookie(res)!;
    expect(next.value).not.toBe(cookie.value);
    expect(res.body.accessToken).toBeTruthy();
    // The new cookie works.
    await post('/auth/refresh').set(csrfHeaders).set('Cookie', next.header).expect(200);
  });

  it('requires the CSRF header and an allowed origin', async () => {
    const { cookie } = await registerVerified(ctx);
    const a = await post('/auth/refresh').set('Cookie', cookie.header).expect(403);
    expect(a.body.error.code).toBe('CSRF_REJECTED');
    await post('/auth/refresh').set({ 'X-Requested-With': 'vnav', Origin: 'https://evil.example' }).set('Cookie', cookie.header).expect(403);
  });

  it('treats an old token presented within the grace window as a race, not theft', async () => {
    const { cookie } = await registerVerified(ctx);
    const r1 = await post('/auth/refresh').set(csrfHeaders).set('Cookie', cookie.header).expect(200);
    const race = await post('/auth/refresh').set(csrfHeaders).set('Cookie', cookie.header).expect(401);
    expect(race.body.error.code).toBe('REFRESH_CONFLICT');
    // Session survives: the newest cookie still works.
    await post('/auth/refresh').set(csrfHeaders).set('Cookie', refreshCookie(r1)!.header).expect(200);
  });

  it('revokes the session when an old token is replayed after the grace window', async () => {
    const { cookie, accessToken } = await registerVerified(ctx);
    const r1 = await post('/auth/refresh').set(csrfHeaders).set('Cookie', cookie.header).expect(200);
    await ctx.container.models.Session.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });

    const replay = await post('/auth/refresh').set(csrfHeaders).set('Cookie', cookie.header).expect(401);
    expect(replay.body.error.code).toBe('SESSION_REVOKED');
    // The legitimate holder of the newest token is also logged out, and access tokens die immediately.
    await post('/auth/refresh').set(csrfHeaders).set('Cookie', refreshCookie(r1)!.header).expect(401);
    const me = await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    expect(me.body.error.code).toBe('SESSION_REVOKED');
    expect(await ctx.container.models.AuditLog.countDocuments({ action: 'token_reuse_detected' })).toBe(1);
  });

  it('rejects missing and garbage cookies', async () => {
    await post('/auth/refresh').set(csrfHeaders).expect(401);
    await post('/auth/refresh').set(csrfHeaders).set('Cookie', 'vnav_rt=' + 'x'.repeat(43)).expect(401);
  });
});

describe('logout and sessions', () => {
  it('logout revokes the session, its access token and its refresh token', async () => {
    const { cookie, accessToken } = await registerVerified(ctx);
    const res = await post('/auth/logout').set(csrfHeaders).set('Cookie', cookie.header).expect(204);
    expect(refreshCookie(res)?.raw).toMatch(/Expires=Thu, 01 Jan 1970/);
    await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    await post('/auth/refresh').set(csrfHeaders).set('Cookie', cookie.header).expect(401);
    // Idempotent.
    await post('/auth/logout').set(csrfHeaders).set('Cookie', cookie.header).expect(204);
  });

  it('lists own sessions, revokes one, and cannot touch another user\'s session', async () => {
    const a = await registerVerified(ctx);
    const second = await post('/auth/login').send({ email: a.student.email, password: a.student.password }).expect(200);
    const b = await registerVerified(ctx);

    const list = await api(ctx.app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${a.accessToken}`).expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const other = list.body.items.find((s: { current: boolean }) => !s.current);

    const bSessions = await api(ctx.app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${b.accessToken}`).expect(200);
    await api(ctx.app)
      .delete(`/api/v1/auth/sessions/${bSessions.body.items[0].id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
    await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${b.accessToken}`).expect(200);

    await api(ctx.app).delete(`/api/v1/auth/sessions/${other.id}`).set('Authorization', `Bearer ${a.accessToken}`).expect(204);
    await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${second.body.accessToken}`).expect(401);
    await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${a.accessToken}`).expect(200);
  });

  it('logout-all ends every session', async () => {
    const a = await registerVerified(ctx);
    const second = await post('/auth/login').send({ email: a.student.email, password: a.student.password }).expect(200);
    await post('/auth/logout-all').set('Authorization', `Bearer ${a.accessToken}`).expect(204);
    for (const t of [a.accessToken, second.body.accessToken]) {
      await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${t}`).expect(401);
    }
  });
});

describe('password reset and change', () => {
  it('forgot answers 202 for unknown emails without sending mail', async () => {
    await post('/auth/password/forgot').send({ email: 'ghost@vitstudent.ac.in' }).expect(202);
    expect(ctx.mail.sent).toHaveLength(0);
  });

  it('resets with a single-use link in the URL fragment and signs out everywhere', async () => {
    const { student, accessToken } = await registerVerified(ctx);
    await post('/auth/password/forgot').send({ email: student.email }).expect(202);
    expect(ctx.mail.lastTo(student.email)?.text).toContain('/reset-password#token=');
    const token = ctx.mail.resetTokenFor(student.email);

    // A rejected weak password does not burn the link.
    const weak = await post('/auth/password/reset').send({ token, password: 'password123' }).expect(400);
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');

    // Requesting a new link invalidates the old one.
    await ctx.container.redis.flushdb(); // clear the per-email mail limit
    await post('/auth/password/forgot').send({ email: student.email }).expect(202);
    const token2 = ctx.mail.resetTokenFor(student.email);
    expect(token2).not.toBe(token);
    const stale = await post('/auth/password/reset').send({ token, password: 'a brand new passphrase' }).expect(400);
    expect(stale.body.error.code).toBe('INVALID_TOKEN');

    await post('/auth/password/reset').send({ token: token2, password: 'a brand new passphrase' }).expect(204);
    // Single use.
    await post('/auth/password/reset').send({ token: token2, password: 'another new passphrase' }).expect(400);

    await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    await post('/auth/login').send({ email: student.email, password: student.password }).expect(401);
    await post('/auth/login').send({ email: student.email, password: 'a brand new passphrase' }).expect(200);
  });

  it('change password needs the current password and keeps only the current session', async () => {
    const a = await registerVerified(ctx);
    const second = await post('/auth/login').send({ email: a.student.email, password: a.student.password }).expect(200);
    const auth = { Authorization: `Bearer ${a.accessToken}` };

    const wrong = await post('/auth/password/change').set(auth).send({ currentPassword: 'nope nope nope', newPassword: 'a brand new passphrase' }).expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    await post('/auth/password/change').set(auth).send({ currentPassword: a.student.password, newPassword: 'a brand new passphrase' }).expect(204);

    await api(ctx.app).get('/api/v1/users/me').set(auth).expect(200);
    await api(ctx.app).get('/api/v1/users/me').set('Authorization', `Bearer ${second.body.accessToken}`).expect(401);
  });
});
