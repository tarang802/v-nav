import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOAD_DIR } from '../helpers/env.js';
import { OFF_CAMPUS, ON_CAMPUS } from '../helpers/realtime.js';
import { api, createTestContext, registerVerified, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});
beforeEach(async () => {
  await ctx.reset();
});

type Student = Awaited<ReturnType<typeof registerVerified>>;

const as = (s: { accessToken: string }) => {
  const auth = { Authorization: `Bearer ${s.accessToken}` };
  return {
    get: (path: string) => api(ctx.app).get(`/api/v1${path}`).set(auth),
    post: (path: string) => api(ctx.app).post(`/api/v1${path}`).set(auth),
    patch: (path: string) => api(ctx.app).patch(`/api/v1${path}`).set(auth),
    put: (path: string) => api(ctx.app).put(`/api/v1${path}`).set(auth),
    del: (path: string) => api(ctx.app).delete(`/api/v1${path}`).set(auth),
  };
};

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const eventBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Robotics Club Demo Day',
  description: 'Line followers and a drone demo.\nBring your ID card.',
  category: 'technical',
  location: ON_CAMPUS,
  venue: { label: 'Academic Block 1 atrium' },
  startsAt: hours(24),
  endsAt: hours(27),
  visibility: 'campus',
  ...overrides,
});

async function createEvent(s: Student, overrides: Record<string, unknown> = {}) {
  const res = await as(s).post('/events').send(eventBody(overrides)).expect(201);
  return res.body.event as { id: string; title: string; imageUrl: string | null };
}

async function befriend(a: Student, b: Student) {
  const sent = await as(a).post('/friends/requests').send({ friendCode: b.user.friendCode }).expect(201);
  await as(b).post(`/friends/requests/${sent.body.request.id}/accept`).expect(200);
}

/** Gives the student a role and signs in again, because the role is carried in the access token. */
async function withRole(s: Student, role: 'moderator' | 'admin') {
  await ctx.container.models.User.updateOne({ _id: s.user.id }, { $set: { role } });
  const res = await api(ctx.app)
    .post('/api/v1/auth/login')
    .send({ email: s.student.email, password: s.student.password })
    .expect(200);
  return { accessToken: res.body.accessToken as string };
}

const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((e) => e.id);

describe('creating events', () => {
  it('creates an event and returns the documented shape', async () => {
    const a = await registerVerified(ctx);
    const res = await as(a).post('/events').send(eventBody({ venue: { buildingId: 'way/336095563', label: 'AB1' } })).expect(201);
    const e = res.body.event;
    expect(e).toMatchObject({
      title: 'Robotics Club Demo Day',
      category: 'technical',
      imageUrl: null,
      location: ON_CAMPUS,
      venue: { buildingId: 'way/336095563', label: 'AB1' },
      visibility: 'campus',
      status: 'active',
      creator: { id: a.user.id, name: a.student.name, avatarUrl: null },
      canEdit: true,
    });
    expect(e.shareUrl).toBe(`http://localhost:5173/events/${e.id}`);
    // Stored as GeoJSON [lng, lat].
    const doc = await ctx.container.models.Event.findById(e.id).lean();
    expect(doc?.location).toEqual({ type: 'Point', coordinates: [ON_CAMPUS.lng, ON_CAMPUS.lat] });
  });

  it('refuses locations outside the campus', async () => {
    const a = await registerVerified(ctx);
    const res = await as(a).post('/events').send(eventBody({ location: OFF_CAMPUS })).expect(422);
    expect(res.body.error.code).toBe('OFF_CAMPUS');
    expect(await ctx.container.models.Event.countDocuments()).toBe(0);
  });

  it('refuses impossible time ranges', async () => {
    const a = await registerVerified(ctx);
    const bad = [
      { startsAt: hours(5), endsAt: hours(4) }, // ends before it starts
      { startsAt: hours(5), endsAt: hours(5) }, // zero length
      { startsAt: hours(1), endsAt: hours(1 + 15 * 24) }, // longer than 14 days
      { startsAt: hours(-5), endsAt: hours(-1) }, // already over
      { startsAt: hours(400 * 24), endsAt: hours(400 * 24 + 2) }, // more than a year ahead
    ];
    for (const times of bad) {
      const res = await as(a).post('/events').send(eventBody(times)).expect(422);
      expect(res.body.error.code).toBe('INVALID_TIME_RANGE');
    }
    // An event that has started but not ended is fine.
    await as(a).post('/events').send(eventBody({ startsAt: hours(-1), endsAt: hours(1) })).expect(201);
  });

  it('validates input strictly', async () => {
    const a = await registerVerified(ctx);
    const cases: Record<string, unknown>[] = [
      { title: 'ab' },
      { title: 'x'.repeat(101) },
      { title: 'Line\u0000break' },
      { description: 'x'.repeat(2001) },
      { category: 'party' },
      { visibility: 'public' },
      { location: { lat: 'x', lng: 80 } },
      { location: { $gt: '' } },
      { venue: { label: '' } },
      { venue: { buildingId: '../../etc', label: 'x' } },
      { startsAt: 'tomorrow' },
      { status: 'active' }, // unknown key on create
      { creatorId: '507f1f77bcf86cd799439011' },
    ];
    for (const c of cases) {
      const res = await as(a).post('/events').send(eventBody(c));
      expect(res.status, JSON.stringify(c)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    await api(ctx.app).post('/api/v1/events').send(eventBody()).expect(401);
  });

  it('stores text as plain text', async () => {
    const a = await registerVerified(ctx);
    const title = '<img src=x onerror=alert(1)> Fest';
    const e = await createEvent(a, { title, description: '<script>alert(1)</script>' });
    const got = await as(a).get(`/events/${e.id}`).expect(200);
    // Returned exactly as typed, in JSON; clients render it as text.
    expect(got.body.event.title).toBe(title);
    expect(got.headers['content-type']).toMatch(/application\/json/);
  });

  it('limits a student to 20 new events a day', async () => {
    const a = await registerVerified(ctx);
    for (let i = 0; i < 20; i++) await createEvent(a, { title: `Event ${i}` });
    const res = await as(a).post('/events').send(eventBody()).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('who can see an event', () => {
  it('shows campus events to everyone and friends-only events to friends', async () => {
    const [alice, bob, eve] = [await registerVerified(ctx), await registerVerified(ctx), await registerVerified(ctx)];
    await befriend(alice, bob);
    const open = await createEvent(alice, { title: 'Open mic' });
    const closed = await createEvent(alice, { title: 'Birthday', visibility: 'friends' });

    expect(ids(await as(alice).get('/events')).sort()).toEqual([open.id, closed.id].sort());
    expect(ids(await as(bob).get('/events')).sort()).toEqual([open.id, closed.id].sort());
    expect(ids(await as(eve).get('/events'))).toEqual([open.id]);

    await as(bob).get(`/events/${closed.id}`).expect(200);
    await as(eve).get(`/events/${closed.id}`).expect(404);
    expect((await as(bob).get(`/events/${closed.id}`)).body.event.canEdit).toBe(false);

    // The map endpoint applies the same rule.
    const box = '80.15,12.838,80.163,12.848';
    const mapIds = async (s: Student) => (await as(s).get(`/events/map?bbox=${box}`).expect(200)).body.features.map((f: { properties: { id: string } }) => f.properties.id).sort();
    expect(await mapIds(bob)).toEqual([open.id, closed.id].sort());
    expect(await mapIds(eve)).toEqual([open.id]);
  });

  it('stops showing friends-only events after unfriending', async () => {
    const [alice, bob] = [await registerVerified(ctx), await registerVerified(ctx)];
    await befriend(alice, bob);
    const closed = await createEvent(alice, { visibility: 'friends' });
    await as(bob).get(`/events/${closed.id}`).expect(200);
    await as(bob).del(`/friends/${alice.user.id}`).expect(204);
    await as(bob).get(`/events/${closed.id}`).expect(404);
    expect(ids(await as(bob).get('/events'))).toEqual([]);
  });

  it('hides every event between blocked students, in both directions', async () => {
    const [alice, bob] = [await registerVerified(ctx), await registerVerified(ctx)];
    const aliceEvent = await createEvent(alice);
    const bobEvent = await createEvent(bob);
    await as(alice).post('/blocks').send({ userId: bob.user.id }).expect(201);

    expect(ids(await as(alice).get('/events'))).toEqual([aliceEvent.id]);
    expect(ids(await as(bob).get('/events'))).toEqual([bobEvent.id]);
    await as(bob).get(`/events/${aliceEvent.id}`).expect(404);
    await as(alice).get(`/events/${bobEvent.id}`).expect(404);
    const box = '80.15,12.838,80.163,12.848';
    expect((await as(bob).get(`/events/map?bbox=${box}`)).body.features).toHaveLength(1);
  });

  it('hides cancelled events from lists but keeps them reachable by link', async () => {
    const [alice, bob] = [await registerVerified(ctx), await registerVerified(ctx)];
    const e = await createEvent(alice);
    const res = await as(alice).patch(`/events/${e.id}`).send({ status: 'cancelled' }).expect(200);
    expect(res.body.event.status).toBe('cancelled');

    expect(ids(await as(bob).get('/events'))).toEqual([]);
    expect((await as(bob).get(`/events/${e.id}`).expect(200)).body.event.status).toBe('cancelled');
    // The organiser still sees it under "my events".
    expect(ids(await as(alice).get('/events?creator=me'))).toEqual([e.id]);
    // Cancelling cannot be undone through the API.
    await as(alice).patch(`/events/${e.id}`).send({ status: 'active' }).expect(400);
  });
});

describe('discovery', () => {
  it('lists upcoming and ongoing events soonest first, and filters them', async () => {
    const a = await registerVerified(ctx);
    const ongoing = await createEvent(a, { title: 'Ongoing', startsAt: hours(-1), endsAt: hours(2), category: 'sports' });
    const soon = await createEvent(a, { title: 'Soon', startsAt: hours(5), endsAt: hours(6), category: 'cultural' });
    const later = await createEvent(a, { title: 'Later', startsAt: hours(24 * 10), endsAt: hours(24 * 10 + 2), category: 'sports', visibility: 'friends' });
    const farOff = await createEvent(a, { title: 'Far off', startsAt: hours(24 * 60), endsAt: hours(24 * 60 + 2) });

    // Default window is the next 30 days.
    expect(ids(await as(a).get('/events').expect(200))).toEqual([ongoing.id, soon.id, later.id]);
    expect(ids(await as(a).get('/events?category=sports'))).toEqual([ongoing.id, later.id]);
    expect(ids(await as(a).get('/events?visibility=friends'))).toEqual([later.id]);

    const from = encodeURIComponent(hours(24 * 50));
    const to = encodeURIComponent(hours(24 * 70));
    expect(ids(await as(a).get(`/events?from=${from}&to=${to}`))).toEqual([farOff.id]);

    await as(a).get(`/events?from=${to}&to=${from}`).expect(400);
    await as(a).get(`/events?to=${encodeURIComponent(hours(24 * 800))}`).expect(400);
    await as(a).get('/events?category=party').expect(400);
    await as(a).get('/events?creator=someone').expect(400);
  });

  it('paginates with a stable cursor', async () => {
    const a = await registerVerified(ctx);
    const created = [];
    for (let i = 0; i < 5; i++) created.push(await createEvent(a, { title: `Talk ${i}`, startsAt: hours(10 + i), endsAt: hours(11 + i) }));
    // Two events starting at exactly the same time must not be skipped or repeated.
    const sameStart = hours(40);
    const twinA = await createEvent(a, { title: 'Twin A', startsAt: sameStart, endsAt: hours(41) });
    const twinB = await createEvent(a, { title: 'Twin B', startsAt: sameStart, endsAt: hours(41) });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await as(a)
        .get(`/events?limit=3${cursor ? `&cursor=${cursor}` : ''}`)
        .expect(200);
      seen.push(...res.body.items.map((e) => e.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen.slice(0, 5)).toEqual(created.map((e) => e.id));
    expect(seen.slice(5).sort()).toEqual([twinA.id, twinB.id].sort());
    expect(new Set(seen).size).toBe(7);
    await as(a).get('/events?cursor=garbage').expect(400);
  });

  it('returns lightweight GeoJSON for the map and respects the bounding box', async () => {
    const a = await registerVerified(ctx);
    const e = await createEvent(a);
    const inside = await as(a).get('/events/map?bbox=80.15,12.838,80.163,12.848').expect(200);
    expect(inside.body.type).toBe('FeatureCollection');
    expect(inside.body.features).toHaveLength(1);
    expect(inside.body.features[0].geometry).toEqual({ type: 'Point', coordinates: [ON_CAMPUS.lng, ON_CAMPUS.lat] });
    expect(Object.keys(inside.body.features[0].properties).sort()).toEqual(['category', 'endsAt', 'id', 'startsAt', 'title']);
    expect(inside.body.features[0].properties.id).toBe(e.id);

    // A box that does not contain the event.
    expect((await as(a).get('/events/map?bbox=80.20,12.90,80.21,12.91').expect(200)).body.features).toEqual([]);

    for (const bad of ['', '1,2,3', 'a,b,c,d', '80.2,12.8,80.1,12.9', '0,0,5,5', '80.15,12.838,80.163']) {
      await as(a).get(`/events/map?bbox=${bad}`).expect(400);
    }
  });
});

describe('changing and deleting events', () => {
  it('lets only the organiser edit', async () => {
    const [alice, bob, eve] = [await registerVerified(ctx), await registerVerified(ctx), await registerVerified(ctx)];
    await befriend(alice, bob);
    const e = await createEvent(alice, { visibility: 'friends' });

    const res = await as(alice).patch(`/events/${e.id}`).send({ title: 'Robotics Demo (moved)', venue: { label: 'Library' } }).expect(200);
    expect(res.body.event).toMatchObject({ title: 'Robotics Demo (moved)', venue: { buildingId: null, label: 'Library' } });

    // A friend can see it but not change it; a stranger is told it does not exist.
    await as(bob).patch(`/events/${e.id}`).send({ title: 'Hijacked' }).expect(403);
    await as(eve).patch(`/events/${e.id}`).send({ title: 'Hijacked' }).expect(404);
    await as(bob).del(`/events/${e.id}`).expect(403);
    await as(eve).del(`/events/${e.id}`).expect(404);
    expect((await ctx.container.models.Event.findById(e.id).lean())?.title).toBe('Robotics Demo (moved)');
  });

  it('re-checks campus and time rules on update', async () => {
    const a = await registerVerified(ctx);
    const e = await createEvent(a);
    expect((await as(a).patch(`/events/${e.id}`).send({ location: OFF_CAMPUS }).expect(422)).body.error.code).toBe('OFF_CAMPUS');
    // Changing only the end time is validated against the stored start time.
    expect((await as(a).patch(`/events/${e.id}`).send({ endsAt: hours(1) }).expect(422)).body.error.code).toBe('INVALID_TIME_RANGE');
    await as(a).patch(`/events/${e.id}`).send({ endsAt: hours(30) }).expect(200);
    await as(a).patch(`/events/${e.id}`).send({}).expect(400);
    await as(a).patch(`/events/${e.id}`).send({ creatorId: '507f1f77bcf86cd799439011' }).expect(400);
  });

  it('lets the organiser delete, and moderators delete with an audit record', async () => {
    const [alice, mod] = [await registerVerified(ctx), await registerVerified(ctx)];
    const own = await createEvent(alice, { title: 'Mine' });
    await as(alice).del(`/events/${own.id}`).expect(204);
    await as(alice).get(`/events/${own.id}`).expect(404);
    expect(await ctx.container.models.AuditLog.countDocuments({ action: 'event_removed_by_moderator' })).toBe(0);

    const reported = await createEvent(alice, { title: 'Spam' });
    await as(mod).del(`/events/${reported.id}`).expect(403); // an ordinary student cannot
    const moderator = await withRole(mod, 'moderator');
    await as(moderator).del(`/events/${reported.id}`).expect(204);
    expect(await ctx.container.models.Event.countDocuments()).toBe(0);

    const audit = await ctx.container.models.AuditLog.findOne({ action: 'event_removed_by_moderator' }).lean();
    expect(audit?.actorId?.toString()).toBe(mod.user.id);
    expect(audit?.targetId?.toString()).toBe(reported.id);
    await as(moderator).del(`/events/${reported.id}`).expect(404);
  });
});

describe('images', () => {
  const photo = (width = 3000, height = 2000) =>
    sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
      .withExif({ IFD0: { Make: 'TestPhone', Copyright: 'someone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 50/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '80/1 9/1 20/1' } })
      .jpeg()
      .toBuffer();

  const fileFor = (url: string) => join(TEST_UPLOAD_DIR, new URL(url).pathname.replace('/uploads/', ''));

  it('re-encodes uploads to WebP, shrinks them and strips GPS metadata', async () => {
    const a = await registerVerified(ctx);
    const e = await createEvent(a);
    const input = await photo();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the test photo really carries EXIF

    const res = await as(a).put(`/events/${e.id}/image`).attach('image', input, 'IMG_0001.jpg').expect(200);
    expect(res.body.imageUrl).toMatch(/^http:\/\/localhost:3999\/uploads\/events\/[a-f0-9]{32}\.webp$/);
    expect((await as(a).get(`/events/${e.id}`)).body.event.imageUrl).toBe(res.body.imageUrl);

    // Fetch it the way a browser would.
    const served = await api(ctx.app).get(new URL(res.body.imageUrl).pathname).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toMatch(/immutable/);

    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067);
    expect(meta.exif).toBeUndefined();
    expect((served.body as Buffer).includes(Buffer.from('TestPhone'))).toBe(false);
  });

  it('replaces and deletes images without leaving files behind', async () => {
    const a = await registerVerified(ctx);
    const e = await createEvent(a);
    const first = (await as(a).put(`/events/${e.id}/image`).attach('image', await photo(400, 300), 'a.jpg').expect(200)).body.imageUrl;
    const second = (await as(a).put(`/events/${e.id}/image`).attach('image', await photo(500, 300), 'b.jpg').expect(200)).body.imageUrl;
    expect(existsSync(fileFor(first))).toBe(false);
    expect(existsSync(fileFor(second))).toBe(true);

    await as(a).del(`/events/${e.id}/image`).expect(204);
    expect(existsSync(fileFor(second))).toBe(false);
    expect((await as(a).get(`/events/${e.id}`)).body.event.imageUrl).toBeNull();

    // Deleting the event removes its image too.
    const third = (await as(a).put(`/events/${e.id}/image`).attach('image', await photo(400, 300), 'c.jpg').expect(200)).body.imageUrl;
    await as(a).del(`/events/${e.id}`).expect(204);
    expect(existsSync(fileFor(third))).toBe(false);
  });

  it('accepts PNG and WebP, and judges files by content, not by name or declared type', async () => {
    const a = await registerVerified(ctx);
    const e = await createEvent(a);
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#00f' } }).png().toBuffer();
    const webp = await sharp(png).webp().toBuffer();
    await as(a).put(`/events/${e.id}/image`).attach('image', png, 'x.png').expect(200);
    await as(a).put(`/events/${e.id}/image`).attach('image', webp, 'x.webp').expect(200);
    // A real PNG with a misleading name and type is still accepted as what it is.
    await as(a).put(`/events/${e.id}/image`).attach('image', png, { filename: 'notes.txt', contentType: 'text/plain' }).expect(200);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('this is not really a jpeg at all')]);
    for (const [bytes, name, type] of [
      [svg, 'logo.svg', 'image/svg+xml'],
      [svg, 'logo.png', 'image/png'], // SVG pretending to be PNG
      [html, 'photo.jpg', 'image/jpeg'],
      [fakeJpeg, 'photo.jpg', 'image/jpeg'], // right magic bytes, undecodable
    ] as const) {
      const res = await as(a).put(`/events/${e.id}/image`).attach('image', bytes, { filename: name, contentType: type });
      expect(res.status, name).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
  });

  it('rejects oversized files, wrong fields and non-multipart bodies', async () => {
    const a = await registerVerified(ctx);
    const e = await createEvent(a);
    const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 1);
    expect((await as(a).put(`/events/${e.id}/image`).attach('image', big, 'big.jpg').expect(413)).body.error.code).toBe('PAYLOAD_TOO_LARGE');
    await as(a).put(`/events/${e.id}/image`).attach('photo', await photo(50, 50), 'a.jpg').expect(400);
    await as(a).put(`/events/${e.id}/image`).send({ image: 'data:image/png;base64,AAAA' }).expect(415);
    await as(a).put(`/events/${e.id}/image`).field('note', 'no file').expect(400);
  });

  it('lets only the organiser change the image', async () => {
    const [alice, bob] = [await registerVerified(ctx), await registerVerified(ctx)];
    const e = await createEvent(alice);
    await as(bob).put(`/events/${e.id}/image`).attach('image', await photo(50, 50), 'a.jpg').expect(403);
    await as(bob).del(`/events/${e.id}/image`).expect(403);
    await api(ctx.app).put(`/api/v1/events/${e.id}/image`).attach('image', await photo(50, 50), 'a.jpg').expect(401);
  });

  it('uploads and removes a profile picture', async () => {
    const [a, b] = [await registerVerified(ctx), await registerVerified(ctx)];
    const res = await as(a).put('/users/me/avatar').attach('image', await photo(2000, 1000), 'me.jpg').expect(200);
    expect(res.body.avatarUrl).toMatch(/\/uploads\/avatars\/[a-f0-9]{32}\.webp$/);
    // Read into memory first: opening by path would keep the file locked on Windows.
    const meta = await sharp(await readFile(fileFor(res.body.avatarUrl))).metadata();
    expect([meta.format, meta.width, meta.exif]).toEqual(['webp', 512, undefined]);

    expect((await as(a).get('/users/me')).body.user.avatarUrl).toBe(res.body.avatarUrl);
    // Other students see it on the profile and on the organiser's events.
    expect((await as(b).get(`/users/${a.user.id}`)).body.user.avatarUrl).toBe(res.body.avatarUrl);
    const e = await createEvent(a);
    expect((await as(b).get(`/events/${e.id}`)).body.event.creator.avatarUrl).toBe(res.body.avatarUrl);

    await as(a).del('/users/me/avatar').expect(204);
    expect(existsSync(fileFor(res.body.avatarUrl))).toBe(false);
    expect((await as(a).get('/users/me')).body.user.avatarUrl).toBeNull();
  });

  it('does not serve anything but stored images from /uploads', async () => {
    await api(ctx.app).get('/uploads/').expect(404);
    await api(ctx.app).get('/uploads/../package.json').expect(404);
    await api(ctx.app).get('/uploads/events/%2e%2e/%2e%2e/package.json').expect(404);
  });
});
