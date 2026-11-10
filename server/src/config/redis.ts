import { Redis } from 'ioredis';
import type { Config } from './env.js';
import type { Logger } from '../observability/logger.js';
import { withTimeout } from './db.js';

/**
 * Command client. Commands fail fast (no offline queue) when Redis is down so
 * that callers can fail closed instead of hanging.
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

/**
 * Publisher and subscriber connections for the Socket.IO Redis adapter. A
 * subscribed connection cannot run other commands, so these are separate from
 * the command client.
 */
export async function connectRedisPubSub(config: Config, logger: Logger): Promise<{ pubClient: Redis; subClient: Redis }> {
  const make = (role: string) => {
    const client = new Redis(config.redis.url, {
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    client.on('error', (err) => logger.error({ err: { message: err.message }, role }, 'redis pub/sub error'));
    return client;
  };
  const pubClient = make('pub');
  const subClient = make('sub');
  await Promise.all([pubClient.connect(), subClient.connect()]);
  return { pubClient, subClient };
}

export async function pingRedis(client: Redis, timeoutMs = 1000): Promise<boolean> {
  if (client.status !== 'ready') return false;
  try {
    return (await withTimeout(client.ping(), timeoutMs)) === 'PONG';
  } catch {
    return false;
  }
}
