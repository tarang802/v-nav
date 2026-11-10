import { Redis } from 'ioredis';
import type { Config } from './env.js';
import type { Logger } from '../observability/logger.js';
import { withTimeout } from './db.js';

/**
 * Command client. Commands fail fast (no offline queue) when Redis is down so
 * that callers can fail closed instead of hanging. Phase 4 adds separate
 * pub/sub clients for the Socket.IO adapter.
 */
export async function connectRedis(config: Config, logger: Logger): Promise<Redis> {
  const client = new Redis(config.redis.url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  let warned = false;
  client.on('error', (err) => {
    if (!warned) logger.error({ err: { message: err.message } }, 'redis error');
    warned = true;
  });
  client.on('ready', () => {
    warned = false;
    logger.info('redis ready');
  });
  await client.connect();
  return client;
}

export async function pingRedis(client: Redis, timeoutMs = 1000): Promise<boolean> {
  if (client.status !== 'ready') return false;
  try {
    return (await withTimeout(client.ping(), timeoutMs)) === 'PONG';
  } catch {
    return false;
  }
}
