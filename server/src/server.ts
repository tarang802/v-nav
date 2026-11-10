import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { createApp } from './app.js';
import { connectMongo } from './config/db.js';
import { ConfigError, loadConfig } from './config/env.js';
import { connectRedis, connectRedisPubSub } from './config/redis.js';
import { buildContainer, type Container } from './container.js';
import { syncAllIndexes } from './models/index.js';
import { createLogger } from './observability/logger.js';
import { attachRealtime, type RealtimeServer } from './realtime/socketServer.js';

// Both fit inside the default 10 s grace period that Docker and most platforms give before SIGKILL.
const DRAIN_TIMEOUT_MS = 6_000;
const HARD_EXIT_MS = 9_000;

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger(config);

  const mongo = await connectMongo(config, logger);
  const redis = await connectRedis(config, logger);
  const container = buildContainer(config, logger, mongo, redis);
  if (!config.isProd) {
    await syncAllIndexes(container.models);
    logger.info('indexes synced (non-production only)');
  }

  const app = createApp(container);
  const server = createServer(app);
  server.keepAliveTimeout = 65_000; // longer than typical LB idle timeouts
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  const sockets = new Set<Socket>();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  const realtime = attachRealtime(server, container, await connectRedisPubSub(config, logger));

  server.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'api listening'));

  registerShutdown(container, server, sockets, realtime);
}

function registerShutdown(c: Container, server: Server, sockets: Set<Socket>, realtime: RealtimeServer) {
  let started = false;
  const shutdown = async (signal: string) => {
    if (started) return;
    started = true;
    c.logger.info({ signal }, 'shutdown started');
    c.lifecycle.shuttingDown = true; // /ready now returns 503 so the LB stops routing here

    const hardExit = setTimeout(() => {
      c.logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, HARD_EXIT_MS);
    hardExit.unref();

    // 1. Stop accepting connections, so reconnecting clients reach a healthy instance.
    const drained = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();

    // 2. Tell sockets to reconnect, then close them.
    await realtime.close();
    c.logger.info('realtime closed');

    // 3. Let in-flight HTTP requests finish, up to the drain timeout.
    await Promise.race([drained, new Promise((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS).unref())]);
    for (const s of sockets) s.destroy();

    c.logger.info('http drained');
    await Promise.allSettled([c.redis.quit(), c.mongo.close()]);
    c.logger.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    c.logger.error({ err: reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (err) => {
    c.logger.fatal({ err }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  console.error('fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
