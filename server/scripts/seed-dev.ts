/**
 * Local development only: creates three verified demo students who are friends
 * with each other, so the app can be used without going through email
 * verification each time.
 *
 *   npm run seed:dev
 *
 * Safe to run repeatedly. Refuses to run in production or against a database
 * that is not on this machine. The accounts are ordinary users; nothing in the
 * server treats them specially.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Types } from 'mongoose';
import { connectMongo } from '../src/config/db.js';
import { loadConfig } from '../src/config/env.js';
import { connectRedis } from '../src/config/redis.js';
import { FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH, FRIEND_CODE_PREFIX } from '../src/constants/auth.js';
import { buildContainer } from '../src/container.js';
import { createLogger } from '../src/observability/logger.js';
import { PasswordService } from '../src/services/passwordService.js';
import { AppError } from '../src/utils/AppError.js';
import { randomFromAlphabet } from '../src/utils/crypto.js';
import { DEMO_PASSWORD, DEMO_STUDENTS } from './seed-dev-constants.js';

const config = loadConfig();
const host = new URL(config.mongo.uri.replace(/^mongodb(\+srv)?:/, 'http:')).hostname;
if (config.isProd || !['localhost', '127.0.0.1', 'mongo'].includes(host)) {
  console.error('seed:dev only runs against a local development database.');
  process.exit(1);
}

const logger = createLogger({ ...config, logLevel: 'warn' });
const mongo = await connectMongo(config, logger);
const redis = await connectRedis(config, logger);
const c = buildContainer(config, logger, mongo, redis);

try {
  const passwordHash = await new PasswordService().hash(DEMO_PASSWORD);

  const ids = [];
  for (const s of DEMO_STUDENTS) {
    let user = await c.repos.users.findByEmail(s.email);
    if (!user) {
      const friendCode = FRIEND_CODE_PREFIX + randomFromAlphabet(FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH);
      user = await c.repos.users.create({ ...s, passwordHash, friendCode });
    }
    if (user.status === 'pending_verification') user = (await c.repos.users.activate(user._id)) ?? user;
    await c.repos.users.setPassword(user._id, passwordHash);
    ids.push(user);
    console.log(`${s.email}  ${user.friendCode}`);
  }

  // Everyone befriends everyone, through the real friend service.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i]!, ids[j]!];
      try {
        const sent = await c.services.friends.sendRequest(a._id, b.friendCode);
        if (sent.kind === 'requested') {
          await c.services.friends.acceptRequest(b._id, new Types.ObjectId(sent.request.id));
        }
      } catch (err) {
        if (!(err instanceof AppError && ['ALREADY_FRIENDS', 'FRIEND_REQUEST_EXISTS'].includes(err.code))) throw err;
      }
    }
  }
  // Two demo events at real campus buildings (centre points from the OpenStreetMap data), created
  // through the real event service. Skipped if the organiser already has upcoming events.
  const organiser = { id: ids[0]!._id, role: 'student' as const, ipHash: '' };
  const existing = await c.services.events.list(organiser, { creator: 'me', limit: 1 });
  if (existing.items.length === 0) {
    const buildings = JSON.parse(readFileSync(resolve('../client/public/data/campus-buildings.geojson'), 'utf8')) as {
      features: { properties: { osmId: string; name: string | null }; geometry: { coordinates: number[][][] } }[];
    };
    const at = (needle: string) => {
      const f = buildings.features.find((x) => x.properties.name?.includes(needle))!;
      const ring = f.geometry.coordinates[0]!.slice(0, -1);
      return {
        location: { lng: ring.reduce((t, q) => t + q[0]!, 0) / ring.length, lat: ring.reduce((t, q) => t + q[1]!, 0) / ring.length },
        venue: { buildingId: f.properties.osmId, label: f.properties.name! },
      };
    };
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
    await c.services.events.create(organiser, {
      title: 'Demo: open mic night', description: 'Sample event created by seed:dev.', category: 'cultural',
      ...at('MG Auditorium'), startsAt: inHours(26), endsAt: inHours(29), visibility: 'campus',
    });
    await c.services.events.create(organiser, {
      title: 'Demo: study group', description: 'Sample friends-only event created by seed:dev.', category: 'academic',
      ...at('library'), startsAt: inHours(50), endsAt: inHours(52), visibility: 'friends',
    });
    console.log('Created two demo events (one campus-wide, one friends-only).');
  }
  console.log('Demo students are verified and friends with each other. Password: see DEMO_PASSWORD in scripts/seed-dev-constants.ts.');
} finally {
  await redis.quit();
  await mongo.close();
}
