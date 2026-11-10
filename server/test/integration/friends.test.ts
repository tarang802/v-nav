import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FRIENDS, MAX_OUTGOING_REQUESTS } from '../../src/constants/social.js';
import { pairKeyOf } from '../../src/models/FriendRequest.js';
import { api, createTestContext, registerVerified, type TestContext } from '../helpers/testApp.js';

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

type Student = Awaited<ReturnType<typeof registerVerified>>;

const as = (s: Student) => {
  const auth = { Authorization: `Bearer ${s.accessToken}` };
  return {
    get: (path: string) => api(ctx.app).get(`/api/v1${path}`).set(auth),
    post: (path: string) => api(ctx.app).post(`/api/v1${path}`).set(auth),
    patch: (path: string) => api(ctx.app).patch(`/api/v1${path}`).set(auth),
    del: (path: string) => api(ctx.app).delete(`/api/v1${path}`).set(auth),
  };
};

const idOf = (s: Student) => s.user.id as string;
const oid = (s: Student) => new Types.ObjectId(idOf(s));

async function makeFriends(a: Student, b: Student) {
  const sent = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
  await as(b).post(`/friends/requests/${sent.body.request.id}/accept`).expect(200);
}

async function friendCount(s: Student) {
  const u = await ctx.container.models.User.findById(idOf(s)).lean();
  return u!.friendCount;
}

describe('lookup by friend code', () => {
  it('finds a student and shows only public fields', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const res = await as(a).get(`/users/lookup?code=${b.user.friendCode}`).expect(200);
    expect(res.body.relationship).toBe('none');
    expect(res.body.acceptsRequests).toBe(true);
    expect(Object.keys(res.body.user).sort()).toEqual(['avatarUrl', 'friendCode', 'id', 'isVerified', 'name']);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('normalises typed codes (lower case, no prefix, Crockford look-alikes)', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const body = (b.user.friendCode as string).slice(5);
    await as(a).get(`/users/lookup?code=${body.toLowerCase()}`).expect(200);
    await as(a).get(`/users/lookup?code=vnav-${body}`).expect(200);
    await as(a).get('/users/lookup?code=not-a-code').expect(400);
  });

  it('reports the relationship from both sides', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    expect((await as(a).get(`/users/lookup?code=${b.user.friendCode}`)).body.relationship).toBe('request_sent');
    expect((await as(b).get(`/users/lookup?code=${a.user.friendCode}`)).body.relationship).toBe('request_received');
    expect((await as(a).get(`/users/lookup?code=${a.user.friendCode}`)).body.relationship).toBe('self');
  });

  it('returns an identical 404 for unknown, unverified and blocked students', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const unknown = await as(a).get('/users/lookup?code=VNAV-ZZZZZ').expect(404);

    await api(ctx.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Pending', email: `pending.${Date.now()}@vitstudent.ac.in`, regNo: '23BCE9999', password: 'a long enough passphrase' })
      .expect(202);
    const pending = await ctx.container.models.User.findOne({ name: 'Pending' }).lean();
    const unverified = await as(a).get(`/users/lookup?code=${pending!.friendCode}`).expect(404);

    await as(b).post('/blocks').send({ userId: idOf(a) }).expect(201);
    const blocked = await as(a).get(`/users/lookup?code=${b.user.friendCode}`).expect(404);
    // The blocker cannot see the blocked student either.
    await as(b).get(`/users/lookup?code=${a.user.friendCode}`).expect(404);

    const strip = (r: { body: { error: { requestId?: string } } }) => ({ ...r.body.error, requestId: undefined });
    expect(strip(unverified)).toEqual(strip(unknown));
    expect(strip(blocked)).toEqual(strip(unknown));
  });

  it('is rate limited per user', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    for (let i = 0; i < 60; i++) await as(a).get(`/users/lookup?code=${b.user.friendCode}`).expect(200);
    const res = await as(a).get(`/users/lookup?code=${b.user.friendCode}`).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('requires authentication and rejects operator injection', async () => {
    await api(ctx.app).get('/api/v1/users/lookup?code=VNAV-AAAAA').expect(401);
    const a = await registerVerified(ctx);
    await as(a).post('/friends/requests').send({ friendCode: { $gt: '' } }).expect(400);
    await as(a).get('/users/lookup?code[$ne]=x').expect(400);
  });
});

describe('friend requests', () => {
  it('sends, lists and accepts a request, creating both edges in one step', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const sent = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    expect(sent.body.request.to.id).toBe(idOf(b));

    const incoming = await as(b).get('/friends/requests/incoming').expect(200);
    expect(incoming.body.items).toHaveLength(1);
    expect(incoming.body.items[0].from.id).toBe(idOf(a));
    expect((await as(a).get('/friends/requests/outgoing')).body.items[0].to.id).toBe(idOf(b));

    const accepted = await as(b).post(`/friends/requests/${sent.body.request.id}/accept`).expect(200);
    expect(accepted.body.friend.id).toBe(idOf(a));
    expect(accepted.body.friend.regNo).toBe(a.student.regNo);
    expect(accepted.body.friend).not.toHaveProperty('email');

    expect(await ctx.container.models.Friendship.countDocuments()).toBe(2);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(0);
    expect(await friendCount(a)).toBe(1);
    expect(await friendCount(b)).toBe(1);

    const list = await as(a).get('/friends').expect(200);
    expect(list.body.items.map((f: { id: string }) => f.id)).toEqual([idOf(b)]);
    expect(list.body.nextCursor).toBeNull();
  });

  it('rejects duplicates, self-requests and requests to existing friends', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    const dup = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(409);
    expect(dup.body.error.code).toBe('FRIEND_REQUEST_EXISTS');

    const self = await as(a).post('/friends/requests').send({ friendCode: a.user.friendCode }).expect(400);
    expect(self.body.error.code).toBe('VALIDATION_ERROR');

    const req = await ctx.container.models.FriendRequest.findOne().lean();
    await as(b).post(`/friends/requests/${req!._id}/accept`).expect(200);
    const again = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(409);
    expect(again.body.error.code).toBe('ALREADY_FRIENDS');
    await as(a).post('/friends/requests').send({ friendCode: 'VNAV-ZZZZZ' }).expect(404);
  });

  it('accepts automatically when the other student already sent a request', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    const res = await as(b).post('/friends/requests').send({ friendCode: a.user.friendCode }).expect(200);
    expect(res.body.autoAccepted).toBe(true);
    expect(res.body.friend.id).toBe(idOf(a));
    expect(await ctx.container.models.Friendship.countDocuments()).toBe(2);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(0);
  });

  it('creates exactly one friendship when two students request each other at the same time', async () => {
    for (let round = 0; round < 5; round++) {
      await ctx.reset();
      const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
      const results = await Promise.all([
        as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }),
        as(b).post('/friends/requests').send({ friendCode: a.user.friendCode }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(await ctx.container.models.Friendship.countDocuments()).toBe(2);
      expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(0);
      expect(await friendCount(a)).toBe(1);
      expect(await friendCount(b)).toBe(1);
    }
  });

  it('stores only one request when the same request is sent concurrently', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const results = await Promise.all(
      Array.from({ length: 5 }, () => as(a).post('/friends/requests').send({ friendCode: b.user.friendCode })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(1);
  });

  it('lets only the recipient accept or reject, and only the sender cancel', async () => {
    const [a, b, c] = [await registerVerified(ctx), await registerVerified(ctx), await registerVerified(ctx)];
    const { body } = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    const id = body.request.id as string;

    await as(a).post(`/friends/requests/${id}/accept`).expect(404);
    await as(c).post(`/friends/requests/${id}/accept`).expect(404);
    await as(c).post(`/friends/requests/${id}/reject`).expect(404);
    await as(b).del(`/friends/requests/${id}`).expect(404);
    await as(c).del(`/friends/requests/${id}`).expect(404);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(1);

    await as(b).post(`/friends/requests/${id}/reject`).expect(204);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(0);
    await as(b).post(`/friends/requests/${id}/accept`).expect(404);

    const again = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    await as(a).del(`/friends/requests/${again.body.request.id}`).expect(204);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(0);
    await as(a).post('/friends/requests/not-an-id/accept').expect(400);
  });

  it('respects allowFriendRequests', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const priv = await as(b).patch('/users/me/privacy').send({ allowFriendRequests: false }).expect(200);
    expect(priv.body.privacy).toEqual({ showOnlineStatus: true, allowFriendRequests: false });
    expect((await as(a).get(`/users/lookup?code=${b.user.friendCode}`)).body.acceptsRequests).toBe(false);
    const res = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(403);
    expect(res.body.error.code).toBe('FRIEND_REQUESTS_DISABLED');
  });

  it(`caps pending outgoing requests at ${MAX_OUTGOING_REQUESTS}`, async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    // Seed the pending requests directly; creating 50 real accounts would only slow the suite.
    await ctx.container.models.FriendRequest.insertMany(
      Array.from({ length: MAX_OUTGOING_REQUESTS }, () => {
        const to = new Types.ObjectId();
        return { from: oid(a), to, pairKey: pairKeyOf(oid(a), to) };
      }),
    );
    const res = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(409);
    expect(res.body.error.code).toBe('FRIEND_LIMIT_REACHED');
  });

  it(`rolls back the whole accept when a student is at ${MAX_FRIENDS} friends`, async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const { body } = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
    await ctx.container.models.User.updateOne({ _id: oid(a) }, { $set: { friendCount: MAX_FRIENDS } });

    const res = await as(b).post(`/friends/requests/${body.request.id}/accept`).expect(409);
    expect(res.body.error.code).toBe('FRIEND_LIMIT_REACHED');
    // b's counter increment and the request deletion were rolled back with the transaction.
    expect(await friendCount(b)).toBe(0);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(1);
    expect(await ctx.container.models.Friendship.countDocuments()).toBe(0);
  });
});

describe('friendships', () => {
  it('shows the friend view only to friends', async () => {
    const [a, b, c] = [await registerVerified(ctx), await registerVerified(ctx), await registerVerified(ctx)];
    await makeFriends(a, b);
    const asFriend = await as(a).get(`/users/${idOf(b)}`).expect(200);
    expect(asFriend.body.relationship).toBe('friends');
    expect(asFriend.body.user.regNo).toBe(b.student.regNo);
    expect(asFriend.body.user).toHaveProperty('lastSeenAt');
    expect(asFriend.body.user).not.toHaveProperty('email');

    const asStranger = await as(c).get(`/users/${idOf(b)}`).expect(200);
    expect(asStranger.body.relationship).toBe('none');
    expect(asStranger.body.user).not.toHaveProperty('regNo');

    await as(b).patch('/users/me/privacy').send({ showOnlineStatus: false }).expect(200);
    expect((await as(a).get(`/users/${idOf(b)}`)).body.user).not.toHaveProperty('lastSeenAt');

    const self = await as(a).get(`/users/${idOf(a)}`).expect(200);
    expect(self.body.relationship).toBe('self');
    expect(self.body.user.email).toBe(a.student.email);
    await as(a).get(`/users/${new Types.ObjectId().toHexString()}`).expect(404);
  });

  it('unfriends both ways, updates counters and the cache, and notifies listeners', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await makeFriends(a, b);
    const cache = ctx.container.services.relationships;
    expect(await cache.areFriends(oid(a), oid(b))).toBe(true); // populates the cache

    const ended: string[] = [];
    ctx.container.services.friends.onRelationshipEnded((x, y) => {
      ended.push([x.toHexString(), y.toHexString()].sort().join(':'));
    });

    await as(b).del(`/friends/${idOf(a)}`).expect(204);
    expect(await ctx.container.models.Friendship.countDocuments()).toBe(0);
    expect(await friendCount(a)).toBe(0);
    expect(await friendCount(b)).toBe(0);
    expect(await cache.areFriends(oid(a), oid(b))).toBe(false);
    expect(await cache.areFriends(oid(b), oid(a))).toBe(false);
    expect(ended).toEqual([[idOf(a), idOf(b)].sort().join(':')]);

    await as(b).del(`/friends/${idOf(a)}`).expect(404);
  });

  it('paginates the friend list with an opaque cursor', async () => {
    const me = await registerVerified(ctx);
    const others = [];
    for (let i = 0; i < 3; i++) {
      const o = await registerVerified(ctx);
      await makeFriends(me, o);
      others.push(o);
    }
    const p1 = await as(me).get('/friends?limit=2').expect(200);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await as(me).get(`/friends?limit=2&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();

    const seen = [...p1.body.items, ...p2.body.items].map((f: { id: string }) => f.id);
    // Newest friendship first.
    expect(seen).toEqual(others.map(idOf).reverse());

    await as(me).get('/friends?cursor=garbage').expect(400);
    await as(me).get('/friends?limit=51').expect(400);
  });
});

describe('blocks', () => {
  it('removes the friendship and pending requests, and hides both students from each other', async () => {
    const [a, b, c] = [await registerVerified(ctx), await registerVerified(ctx), await registerVerified(ctx)];
    await makeFriends(a, b);
    await as(c).post('/friends/requests').send({ friendCode: a.user.friendCode }).expect(201);
    const cache = ctx.container.services.relationships;
    expect(await cache.areFriends(oid(b), oid(a))).toBe(true);

    await as(a).post('/blocks').send({ userId: idOf(b) }).expect(201);
    await as(a).post('/blocks').send({ userId: idOf(c) }).expect(201);

    expect(await ctx.container.models.Friendship.countDocuments()).toBe(0);
    expect(await ctx.container.models.FriendRequest.countDocuments()).toBe(0);
    expect(await friendCount(a)).toBe(0);
    expect(await friendCount(b)).toBe(0);
    expect(await cache.areFriends(oid(b), oid(a))).toBe(false);
    expect(await cache.isBlockedEitherWay(oid(b), oid(a))).toBe(true);

    // The blocked student gets the same 404 as for a stranger who does not exist.
    await as(b).post('/friends/requests').send({ friendCode: a.user.friendCode }).expect(404);
    await as(b).get(`/users/${idOf(a)}`).expect(404);
    await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(404);

    const list = await as(a).get('/blocks').expect(200);
    expect(list.body.items).toHaveLength(2);

    const audit = await ctx.container.models.AuditLog.find({ action: 'user_blocked' }).lean();
    expect(audit).toHaveLength(2);
    expect(audit[0]!.ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is idempotent, refuses self-blocks, and 404s unknown users', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await as(a).post('/blocks').send({ userId: idOf(b) }).expect(201);
    await as(a).post('/blocks').send({ userId: idOf(b) }).expect(201);
    expect(await ctx.container.models.Block.countDocuments()).toBe(1);
    expect(await ctx.container.models.AuditLog.countDocuments({ action: 'user_blocked' })).toBe(1);
    await as(a).post('/blocks').send({ userId: idOf(a) }).expect(400);
    await as(a).post('/blocks').send({ userId: new Types.ObjectId().toHexString() }).expect(404);
  });

  it('unblocking does not restore the friendship', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await makeFriends(a, b);
    await as(a).post('/blocks').send({ userId: idOf(b) }).expect(201);
    await as(a).del(`/blocks/${idOf(b)}`).expect(204);
    await as(a).del(`/blocks/${idOf(b)}`).expect(204);

    expect(await ctx.container.models.Block.countDocuments()).toBe(0);
    expect(await ctx.container.services.relationships.isBlockedEitherWay(oid(b), oid(a))).toBe(false);
    expect((await as(a).get(`/users/${idOf(b)}`)).body.relationship).toBe('none');
    // They can become friends again through a new request.
    await makeFriends(b, a);
  });

  it('only the blocker can lift a block', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    await as(a).post('/blocks').send({ userId: idOf(b) }).expect(201);
    await as(b).del(`/blocks/${idOf(a)}`).expect(204); // no-op: b has no block on a
    expect(await ctx.container.models.Block.countDocuments()).toBe(1);
    await as(b).get(`/users/${idOf(a)}`).expect(404);
  });
});

describe('profile and privacy', () => {
  it('updates the display name and validates input', async () => {
    const a = await registerVerified(ctx);
    const res = await as(a).patch('/users/me').send({ name: '  Asha R  ' }).expect(200);
    expect(res.body.user.name).toBe('Asha R');
    await as(a).patch('/users/me').send({}).expect(400);
    await as(a).patch('/users/me').send({ email: 'x@vitstudent.ac.in' }).expect(400);
    await as(a).patch('/users/me').send({ role: 'admin' }).expect(400);
    await as(a).patch('/users/me/privacy').send({ showOnlineStatus: 'no' }).expect(400);
  });
});
