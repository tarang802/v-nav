import type { RequestHandler } from 'express';
import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import { pingMongo } from '../config/db.js';
import { pingRedis } from '../config/redis.js';
import type { Lifecycle } from '../container.js';

export function createHealthController(deps: { mongo: Connection; redis: Redis; lifecycle: Lifecycle }) {
  /** Liveness: the process answers. No dependency checks, so a DB blip does not restart every instance. */
  const health: RequestHandler = (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  };

  /** Readiness: can this instance serve traffic right now? */
  const ready: RequestHandler = async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (deps.lifecycle.shuttingDown) {
      res.status(503).json({ status: 'shutting_down', checks: {} });
      return;
    }
    const [mongoOk, redisOk] = await Promise.all([pingMongo(deps.mongo), pingRedis(deps.redis)]);
    const checks = { mongo: mongoOk ? 'ok' : 'fail', redis: redisOk ? 'ok' : 'fail' };
    res.status(mongoOk && redisOk ? 200 : 503).json({ status: mongoOk && redisOk ? 'ready' : 'not_ready', checks });
  };

  return { health, ready };
}
