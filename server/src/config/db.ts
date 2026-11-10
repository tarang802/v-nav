import mongoose, { type Connection } from 'mongoose';
import type { Config } from './env.js';
import type { Logger } from '../observability/logger.js';

/**
 * One Mongoose connection per process. MongoDB must be a replica set
 * (Atlas always is; locally `--replSet rs0`) because friendship and block
 * changes use multi-document transactions.
 */
export async function connectMongo(config: Config, logger: Logger): Promise<Connection> {
  mongoose.set('strictQuery', true);
  // Never build indexes implicitly in production: `npm run db:indexes` is a release step.
  mongoose.set('autoIndex', !config.isProd);

  const conn = mongoose.createConnection(config.mongo.uri, {
    maxPoolSize: config.mongo.poolSize,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    retryWrites: true,
  });

  conn.on('disconnected', () => logger.warn('mongo disconnected'));
  conn.on('reconnected', () => logger.info('mongo reconnected'));
  conn.on('error', (err) => logger.error({ err }, 'mongo error'));

  await conn.asPromise();
  logger.info({ db: conn.name }, 'mongo connected');
  return conn;
}

export async function pingMongo(conn: Connection, timeoutMs = 1000): Promise<boolean> {
  if (conn.readyState !== 1 || !conn.db) return false;
  try {
    await withTimeout(conn.db.admin().ping(), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
