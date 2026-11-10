import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { TEST_MONGO_URI, TEST_REDIS_URL } from './env.js';

/** Fails fast with a clear instruction when the test dependencies are not running. */
export default async function setup() {
  const hint = 'Start them with: docker compose up -d mongo redis';
  try {
    const conn = await mongoose.createConnection(TEST_MONGO_URI, { serverSelectionTimeoutMS: 3000 }).asPromise();
    const hello = await conn.db!.admin().command({ hello: 1 });
    await conn.close();
    if (!hello.setName) throw new Error('MongoDB is not a replica set (transactions need one)');
  } catch (err) {
    throw new Error(`MongoDB not reachable at ${TEST_MONGO_URI}: ${(err as Error).message}. ${hint}`);
  }
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 0 });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    throw new Error(`Redis not reachable at ${TEST_REDIS_URL}: ${(err as Error).message}. ${hint}`);
  } finally {
    redis.disconnect();
  }
}
