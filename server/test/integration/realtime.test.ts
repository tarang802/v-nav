import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CapturingMailTransport, csrfHeaders, registerVerified, type TestContext } from '../helpers/testApp.js';
import {
  asTestContext,
  OFF_CAMPUS,
  ON_CAMPUS,
  position,
  sleep,
  startInstance,
  TestClient,
  type Instance,
} from '../helpers/realtime.js';
import { TEST_ORIGIN } from '../helpers/env.js';

const mail = new CapturingMailTransport();
let one: Instance;
let two: Instance;
let ctx: TestContext;
const clients: TestClient[] = [];

beforeAll(async () => {
  one = await startInstance(mail, { sweepMs: 100, tokenCheckMs: 100 });
  two = await startInstance(mail, { sweepMs: 100, tokenCheckMs: 100 });
  ctx = asTestContext(one, mail);
});
afterAll(async () => {
  await one.close();
  await two.close();
});
beforeEach(async () => {
  await ctx.reset();
});
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});

type Student = Awaited<ReturnType<typeof registerVerified>>;

const student = () => registerVerified(ctx);
const http = (i: Instance = one) => request(i.http);
const bearer = (s: Student) => ({ Authorization: `Bearer ${s.accessToken}` });

async function connect(s: Student, i: Instance = one): Promise<TestClient> {
  const c = new TestClient(i.url, s.accessToken);
  clients.push(c);
  await c.connect();
  await c.next('friends:snapshot'); // connection setup finished
  return c;
}

async function befriend(a: Student, b: Student) {
  const sent = await http().post('/api/v1/friends/requests').set(bearer(a)).send({ friendCode: b.user.friendCode }).expect(201);
  await http().post(`/api/v1/friends/requests/${sent.body.request.id}/accept`).set(bearer(b)).expect(200);
}

async function startSharing(c: TestClient, durationMinutes: number | null = 60) {
  const ack = await c.emitAck<{ ok: boolean; data: { sharing: boolean; expiresAt: string | null } }>('location:share:start', {
    durationMinutes,
  });
  expect(ack.ok).toBe(true);
  return ack.data;
}

/** Asserts nothing named `event` arrives within `ms`. */
async function expectSilence(c: TestClient, event: string, ms = 400) {
  const before = c.count(event);
  await sleep(ms);
  expect(c.count(event)).toBe(before);
}

describe('handshake', () => {
  it('rejects missing, invalid and revoked tokens with a machine-readable code', async () => {
    const s = await student();
    await expect(new TestClient(one.url, undefined).connect()).rejects.toMatchObject({ data: { code: 'UNAUTHENTICATED' } });
    await expect(new TestClient(one.url, 'not-a-jwt').connect()).rejects.toMatchObject({ data: { code: 'UNAUTHENTICATED' } });

    await http()
      .post('/api/v1/auth/logout')
      .set(csrfHeaders)
      .set('Cookie', s.cookie.header)
      .expect(204);
    await expect(new TestClient(one.url, s.accessToken).connect()).rejects.toMatchObject({ data: { code: 'SESSION_REVOKED' } });
  });

  it('rejects WebSocket connections from origins that are not allowed', async () => {
    const s = await student();
    await expect(new TestClient(one.url, s.accessToken, { Origin: 'https://evil.example' }).connect()).rejects.toBeDefined();
    const ok = new TestClient(one.url, s.accessToken, { Origin: TEST_ORIGIN });
    clients.push(ok);
    await ok.connect();
  });

  it('sends the sharing state and a friends snapshot on connect', async () => {
    const s = await student();
    const c = await connect(s);
    expect(await c.next('location:share:state')).toEqual({ sharing: false, startedAt: null, expiresAt: null });
    expect(await c.next('friends:snapshot')).toEqual({ locations: [], presence: [] });
  });
});

describe('location sharing', () => {
  it('delivers updates to friends only, never to other students', async () => {
    const [alice, bob, eve] = [await student(), await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb, ce] = [await connect(alice), await connect(bob), await connect(eve)];

    const state = await startSharing(ca, 60);
    expect(state.sharing).toBe(true);
    expect(new Date(state.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);

    ca.socket.emit('location:update', position(ON_CAMPUS));
    expect(await cb.nextNew('friend:location')).toMatchObject({ userId: alice.user.id, ...ON_CAMPUS, accuracy: 15 });
    await expectSilence(ce, 'friend:location');
  });

  it('never broadcasts the position of a student who has no friends', async () => {
    const [loner, other] = [await student(), await student()];
    const [cl, co] = [await connect(loner), await connect(other)];
    await startSharing(cl);
    cl.socket.emit('location:update', position(ON_CAMPUS));
    await expectSilence(co, 'friend:location', 500);
  });

  it('syncs sharing state to the same user’s other tabs', async () => {
    const alice = await student();
    const [tab1, tab2] = [await connect(alice), await connect(alice)];
    const pending = tab2.nextNew('location:share:state');
    await startSharing(tab1, 15);
    expect(await pending).toMatchObject({ sharing: true });
  });

  it('rejects updates when not sharing, inaccurate, malformed, stale or too frequent', async () => {
    const alice = await student();
    const ca = await connect(alice);

    ca.socket.emit('location:update', position(ON_CAMPUS));
    expect(await ca.nextNew('location:rejected')).toEqual({ code: 'NOT_SHARING' });

    await startSharing(ca);
    ca.socket.emit('location:update', position(ON_CAMPUS, { accuracy: 250 }));
    expect(await ca.nextNew('location:rejected')).toEqual({ code: 'LOW_ACCURACY' });

    ca.socket.emit('location:update', { lat: 'x', lng: 80 });
    expect(await ca.nextNew('location:rejected')).toEqual({ code: 'VALIDATION_ERROR' });

    ca.socket.emit('location:update', position(ON_CAMPUS, { ts: Date.now() - 10 * 60_000 }));
    expect(await ca.nextNew('location:rejected')).toEqual({ code: 'VALIDATION_ERROR' });

    // The NOT_SHARING attempt above already used this user's 2 s rate slot.
    await sleep(2100);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await sleep(100);
    expect(ca.count('location:rejected')).toBe(4);
    const p = ca.nextNew('location:rejected');
    ca.socket.emit('location:update', position(ON_CAMPUS));
    expect(await p).toEqual({ code: 'RATE_LIMITED' });

    // The rate-limit notice itself is throttled, so a spamming client gets no feedback loop.
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await expectSilence(ca, 'location:rejected', 300);
  });

  it('drops off-campus positions and tells friends once', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice), await connect(bob)];
    await startSharing(ca);

    ca.socket.emit('location:update', position(ON_CAMPUS));
    await cb.nextNew('friend:location');

    await sleep(2100);
    const removed = cb.nextNew('friend:location:removed');
    ca.socket.emit('location:update', position(OFF_CAMPUS));
    expect(await ca.nextNew('location:rejected')).toEqual({ code: 'OFF_CAMPUS' });
    expect(await removed).toEqual({ userId: alice.user.id, reason: 'off_campus' });
    expect(await one.container.redis.exists(`loc:${alice.user.id}`)).toBe(0);

    await sleep(2100);
    ca.socket.emit('location:update', position(OFF_CAMPUS));
    await ca.nextNew('location:rejected');
    expect(cb.count('friend:location:removed')).toBe(1);
  });

  it('stores positions in Redis with a TTL and writes nothing to MongoDB', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice), await connect(bob)];
    await startSharing(ca);

    const db = one.container.mongo.db!;
    const before = (await db.listCollections().toArray()).map((c) => c.name).sort();
    const userBefore = await one.container.models.User.findById(alice.user.id).lean();

    ca.socket.emit('location:update', position(ON_CAMPUS));
    await cb.nextNew('friend:location');

    const ttl = await one.container.redis.pttl(`loc:${alice.user.id}`);
    expect(ttl).toBeGreaterThan(100_000);
    expect(ttl).toBeLessThanOrEqual(120_000);
    expect((await db.listCollections().toArray()).map((c) => c.name).sort()).toEqual(before);
    const userAfter = await one.container.models.User.findById(alice.user.id).lean();
    expect(userAfter).toEqual(userBefore);
    expect(JSON.stringify(userAfter)).not.toContain(String(ON_CAMPUS.lat));
  });

  it('stops sharing over the socket and via the REST emergency stop', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice), await connect(bob)];

    await startSharing(ca);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await cb.nextNew('friend:location');
    let removed = cb.nextNew('friend:location:removed');
    expect((await ca.emitAck('location:share:stop')).ok).toBe(true);
    expect(await removed).toEqual({ userId: alice.user.id, reason: 'stopped' });
    expect(await one.container.redis.exists(`loc:${alice.user.id}`, `share:${alice.user.id}`)).toBe(0);

    await startSharing(ca);
    expect((await http().get('/api/v1/location/sharing').set(bearer(alice)).expect(200)).body.sharing).toBe(true);
    removed = cb.nextNew('friend:location:removed');
    const ownState = ca.nextNew('location:share:state');
    await http().post('/api/v1/location/sharing/stop').set(bearer(alice)).expect(204);
    expect(await removed).toMatchObject({ reason: 'stopped' });
    expect(await ownState).toMatchObject({ sharing: false });
    expect((await http().get('/api/v1/location/sharing').set(bearer(alice))).body).toEqual({
      sharing: false,
      startedAt: null,
      expiresAt: null,
    });
  });

  it('expires timed shares and tells friends exactly once across instances', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice, one), await connect(bob, two)];
    await startSharing(ca, 15);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await cb.nextNew('friend:location');

    // Move the share's end time into the past; both instances' sweepers race to claim it.
    await one.container.redis.zadd('share:expiry', Date.now() - 1, alice.user.id);
    expect(await cb.nextNew('friend:location:removed')).toEqual({ userId: alice.user.id, reason: 'expired' });
    expect(await ca.next('location:share:state', 3000, ca.received.length - 1)).toBeDefined();
    await sleep(400);
    expect(cb.all('friend:location:removed')).toHaveLength(1);
    expect(await one.container.redis.exists(`share:${alice.user.id}`, `loc:${alice.user.id}`)).toBe(0);
  });

  it('rejects invalid share durations', async () => {
    const alice = await student();
    const ca = await connect(alice);
    const res = await ca.emitAck('location:share:start', { durationMinutes: 999 });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('revocation', () => {
  it('stops delivery immediately when a friend is removed', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice), await connect(bob)];
    await startSharing(ca);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await cb.nextNew('friend:location');

    const removed = cb.nextNew('friend:location:removed');
    const gone = cb.nextNew('friendship:removed');
    await http().delete(`/api/v1/friends/${bob.user.id}`).set(bearer(alice)).expect(204);
    expect(await removed).toEqual({ userId: alice.user.id, reason: 'revoked' });
    expect(await gone).toEqual({ userId: alice.user.id });

    await sleep(2100);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await expectSilence(cb, 'friend:location', 500);
  });

  it('stops delivery immediately on block, and the blocked student only sees a removal', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice), await connect(bob)];
    await startSharing(ca);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await cb.nextNew('friend:location');

    const removed = cb.nextNew('friend:location:removed');
    await http().post('/api/v1/blocks').set(bearer(alice)).send({ userId: bob.user.id }).expect(201);
    expect(await removed).toEqual({ userId: alice.user.id, reason: 'revoked' });
    expect(JSON.stringify(cb.received)).not.toContain('block');

    await sleep(2100);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await expectSilence(cb, 'friend:location', 500);
  });

  it('disconnects the sockets of a signed-out session', async () => {
    const alice = await student();
    const ca = await connect(alice);
    const revoked = ca.nextNew('session:revoked');
    const disconnected = ca.waitDisconnect();
    await http().post('/api/v1/auth/logout').set(csrfHeaders).set('Cookie', alice.cookie.header).expect(204);
    expect(await revoked).toMatchObject({ reason: 'logout' });
    expect(await disconnected).toBe('io server disconnect');
  });

  it('signing out everywhere ends sharing and tells friends', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice), await connect(bob, two)];
    await startSharing(ca);
    const removed = cb.nextNew('friend:location:removed');
    const disconnected = ca.waitDisconnect();
    await http().post('/api/v1/auth/logout-all').set(bearer(alice)).expect(204);
    expect(await removed).toEqual({ userId: alice.user.id, reason: 'stopped' });
    await disconnected;
    expect(await one.container.redis.exists(`share:${alice.user.id}`)).toBe(0);
  });

  it('disconnects sockets whose access token has expired', async () => {
    const alice = await student();
    const ca = await connect(alice);
    const server = [...one.realtime.io.of('/').sockets.values()][0]!;
    server.data.tokenExp = Math.floor(Date.now() / 1000) - 120;
    expect(await ca.nextNew('auth:expired')).toEqual({ code: 'TOKEN_EXPIRED' });
    await ca.waitDisconnect();
  });

  it('accepts a refreshed token for the same session and refuses one from another session', async () => {
    const alice = await student();
    const ca = await connect(alice);
    const refreshed = await http().post('/api/v1/auth/refresh').set(csrfHeaders).set('Cookie', alice.cookie.header).expect(200);
    const ok = await ca.emitAck<{ ok: boolean; data: { exp: number } }>('auth:refresh', { token: refreshed.body.accessToken });
    expect(ok.ok).toBe(true);
    expect(ok.data.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: alice.student.email, password: alice.student.password })
      .expect(200);
    const disconnected = ca.waitDisconnect();
    const bad = await ca.emitAck('auth:refresh', { token: login.body.accessToken }).catch(() => ({ ok: false }));
    expect(bad.ok).toBe(false);
    await disconnected;
  });
});

describe('friends over sockets', () => {
  it('notifies of new requests and shows a sharing friend as soon as the friendship starts', async () => {
    const [alice, bob] = [await student(), await student()];
    const [ca, cb] = [await connect(alice), await connect(bob, two)];
    await startSharing(ca);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    await sleep(100);

    const incoming = cb.nextNew('friend:request:received');
    const sent = await http().post('/api/v1/friends/requests').set(bearer(bob)).send({ friendCode: alice.user.friendCode }).expect(201);
    expect(await incoming.catch(() => null)).toBeNull(); // the sender is not notified of their own request
    const aliceIncoming = await ca.next('friend:request:received');
    expect(aliceIncoming).toMatchObject({ requestId: sent.body.request.id, from: { id: bob.user.id } });

    const accepted = cb.nextNew('friend:request:accepted');
    const located = cb.nextNew('friend:location');
    await http().post(`/api/v1/friends/requests/${sent.body.request.id}/accept`).set(bearer(alice)).expect(200);
    expect(await accepted).toMatchObject({ friend: { id: alice.user.id } });
    expect(await located).toMatchObject({ userId: alice.user.id, ...ON_CAMPUS });
  }, 10_000);

  it('includes sharing friends in the snapshot, and nobody else', async () => {
    const [alice, bob, eve] = [await student(), await student(), await student()];
    await befriend(alice, bob);
    const [ca, ce] = [await connect(alice), await connect(eve)];
    await startSharing(ca);
    await startSharing(ce);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    ce.socket.emit('location:update', position(ON_CAMPUS));
    await sleep(200);

    const cb = await connect(bob);
    const snap = (await cb.next('friends:snapshot')) as { locations: { userId: string }[]; presence: { userId: string; online: boolean }[] };
    expect(snap.locations.map((l) => l.userId)).toEqual([alice.user.id]);
    expect(snap.presence).toEqual([{ userId: alice.user.id, online: true, lastSeenAt: null }]);

    const again = await cb.emitAck('friends:snapshot:request');
    expect(again.ok).toBe(true);
    const tooSoon = await cb.emitAck('friends:snapshot:request');
    expect(tooSoon).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});

describe('presence', () => {
  it('goes online with the first tab and offline only when the last tab closes', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const cb = await connect(bob);

    const online = cb.nextNew('friend:presence');
    const tab1 = await connect(alice, one);
    expect(await online).toEqual({ userId: alice.user.id, online: true, lastSeenAt: null });
    const tab2 = await connect(alice, two);
    await sleep(200);
    expect(cb.count('friend:presence')).toBe(1);

    tab1.close();
    await sleep(300);
    expect(cb.count('friend:presence')).toBe(1);

    const offline = cb.nextNew('friend:presence');
    tab2.close();
    const off = (await offline) as { online: boolean; lastSeenAt: string };
    expect(off.online).toBe(false);
    expect(new Date(off.lastSeenAt).getTime()).toBeGreaterThan(Date.now() - 5000);
    const saved = await one.container.models.User.findById(alice.user.id).lean();
    expect(saved?.lastSeenAt).toBeInstanceOf(Date);
  });

  it('sends no presence when the student hides their online status', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    await http().patch('/api/v1/users/me/privacy').set(bearer(alice)).send({ showOnlineStatus: false }).expect(200);
    const cb = await connect(bob);
    const ca = await connect(alice);
    await sleep(300);
    expect(cb.count('friend:presence')).toBe(0);
    ca.close();
    await sleep(300);
    expect(cb.count('friend:presence')).toBe(0);

    const cb2 = await connect(bob);
    expect(((await cb2.next('friends:snapshot')) as { presence: unknown[] }).presence).toEqual([]);
  });

  it('makes an online student look offline as soon as they hide their status', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const cb = await connect(bob);
    await connect(alice);
    await cb.next('friend:presence');
    const hidden = cb.nextNew('friend:presence');
    await http().patch('/api/v1/users/me/privacy').set(bearer(alice)).send({ showOnlineStatus: false }).expect(200);
    expect(await hidden).toEqual({ userId: alice.user.id, online: false, lastSeenAt: null });
  });
});

describe('abuse protection', () => {
  it('disconnects a socket that floods events', async () => {
    const alice = await student();
    const ca = await connect(alice);
    const disconnected = ca.waitDisconnect();
    for (let i = 0; i < 60; i++) ca.socket.emit('presence:heartbeat', {});
    expect(await disconnected).toBe('io server disconnect');
  });
});

describe('multiple instances', () => {
  it('delivers across instances through the Redis adapter', async () => {
    const [alice, bob] = [await student(), await student()];
    await befriend(alice, bob);
    const [ca, cb] = [await connect(alice, one), await connect(bob, two)];
    await startSharing(ca);
    ca.socket.emit('location:update', position(ON_CAMPUS));
    expect(await cb.nextNew('friend:location')).toMatchObject({ userId: alice.user.id });

    // A friendship removed through instance one reaches the socket on instance two.
    const removed = cb.nextNew('friendship:removed');
    await http(one).delete(`/api/v1/friends/${alice.user.id}`).set(bearer(bob)).expect(204);
    expect(await removed).toEqual({ userId: alice.user.id });
  });
});
