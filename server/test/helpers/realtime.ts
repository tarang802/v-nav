import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { connectMongo } from '../../src/config/db.js';
import { loadConfig } from '../../src/config/env.js';
import { connectRedis, connectRedisPubSub } from '../../src/config/redis.js';
import { buildContainer, type Container } from '../../src/container.js';
import { createLogger } from '../../src/observability/logger.js';
import { attachRealtime, type RealtimeServer } from '../../src/realtime/socketServer.js';
import { PasswordService } from '../../src/services/passwordService.js';
import { testEnv } from './env.js';
import { CapturingMailTransport, type TestContext } from './testApp.js';

/** A point inside the OSM campus boundary, and one well outside it. */
export const ON_CAMPUS = { lat: 12.8435, lng: 80.1555 };
export const OFF_CAMPUS = { lat: 12.9, lng: 80.25 };

/**
 * One API instance with HTTP and Socket.IO on a real port. Several instances
 * can share the test Mongo and Redis, exactly like production replicas.
 */
export interface Instance {
  container: Container;
  realtime: RealtimeServer;
  http: HttpServer;
  url: string;
  close(): Promise<void>;
}

export async function startInstance(
  mail: CapturingMailTransport,
  intervals: Partial<{ sweepMs: number; tokenCheckMs: number; presenceRefreshMs: number }> = {},
): Promise<Instance> {
  const config = loadConfig(testEnv);
  const logger = createLogger(config);
  const mongo = await connectMongo(config, logger);
  const redis = await connectRedis(config, logger);
  const container = buildContainer(config, logger, mongo, redis, { mailTransport: mail, passwordService: new PasswordService(4) });
  const http = createServer(createApp(container));
  const pubsub = await connectRedisPubSub(config, logger);
  const realtime = attachRealtime(http, container, { ...pubsub, adapterKey: 'vnav-test', intervals });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  return {
    container,
    realtime,
    http,
    url: `http://127.0.0.1:${port}`,
    async close() {
      await realtime.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await redis.quit();
      await mongo.close();
    },
  };
}

/** Wraps the minimal TestContext surface the auth helpers need. */
export function asTestContext(instance: Instance, mail: CapturingMailTransport): TestContext {
  return {
    app: instance.http as unknown as TestContext['app'],
    container: instance.container,
    mail,
    async reset() {
      await Promise.all(Object.values(instance.container.models).map((m) => m.deleteMany({})));
      await instance.container.redis.flushdb();
      mail.sent.length = 0;
    },
    async close() {
      await instance.close();
    },
  };
}

interface Received {
  event: string;
  args: unknown[];
}

/** A socket.io client that records every event it receives, so tests never miss one that arrived early. */
export class TestClient {
  readonly received: Received[] = [];
  readonly socket: ClientSocket;
  private waiters: { event: string; resolve: (args: unknown[]) => void; from: number }[] = [];

  constructor(url: string, token: string | undefined, extraHeaders: Record<string, string> = {}) {
    this.socket = ioClient(url, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      forceNew: true,
      auth: token === undefined ? {} : { token },
      extraHeaders,
    });
    this.socket.onAny((event: string, ...args: unknown[]) => {
      this.received.push({ event, args });
      const index = this.received.length - 1;
      this.waiters = this.waiters.filter((w) => {
        if (w.event === event && index >= w.from) {
          w.resolve(args);
          return false;
        }
        return true;
      });
    });
  }

  connect(): Promise<this> {
    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve(this));
      this.socket.once('connect_error', (err) => reject(err));
      this.socket.connect();
    });
  }

  /** Resolves with the first `event` received at or after position `from` (default: from the start). */
  next(event: string, timeoutMs = 3000, from = 0): Promise<unknown> {
    const found = this.received.slice(from).find((r) => r.event === event);
    if (found) return Promise.resolve(found.args[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
      this.waiters.push({
        event,
        from,
        resolve: (args) => {
          clearTimeout(timer);
          resolve(args[0]);
        },
      });
    });
  }

  /** Waits for an event that arrives after this call. */
  nextNew(event: string, timeoutMs = 3000): Promise<unknown> {
    return this.next(event, timeoutMs, this.received.length);
  }

  count(event: string): number {
    return this.received.filter((r) => r.event === event).length;
  }

  all(event: string): unknown[] {
    return this.received.filter((r) => r.event === event).map((r) => r.args[0]);
  }

  emitAck<T = { ok: boolean; data?: unknown; error?: { code: string } }>(event: string, payload: unknown = {}): Promise<T> {
    return this.socket.timeout(3000).emitWithAck(event, payload) as Promise<T>;
  }

  waitDisconnect(timeoutMs = 3000): Promise<string> {
    if (this.socket.disconnected && this.received.length) return Promise.resolve('already');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for disconnect')), timeoutMs);
      this.socket.once('disconnect', (reason) => {
        clearTimeout(timer);
        resolve(reason);
      });
    });
  }

  close() {
    this.socket.disconnect();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const position = (p: { lat: number; lng: number }, extra: Record<string, unknown> = {}) => ({
  ...p,
  accuracy: 15,
  ts: Date.now(),
  ...extra,
});
