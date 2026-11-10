import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { Server, type Socket } from 'socket.io';
import type { ZodType } from 'zod';
import {
  LocationRejectCode,
  PRESENCE_REFRESH_MS,
  RATE_LIMIT_NOTICE_INTERVAL_MS,
  SHARE_SWEEP_INTERVAL_MS,
  SNAPSHOT_MIN_INTERVAL_MS,
  SOCKET_EVENT_BURST,
  SOCKET_EVENT_WINDOW_MS,
  SOCKET_MAX_PAYLOAD_BYTES,
  TOKEN_CHECK_INTERVAL_MS,
  TOKEN_GRACE_SECONDS,
} from '../constants/location.js';
import { ErrorCode } from '../constants/errorCodes.js';
import type { Container } from '../container.js';
import type { LocationStopReason } from '../events/domainEvents.js';
import type { User } from '../models/User.js';
import type { StoredLocation } from '../services/locationStore.js';
import { toFriendUser, toPublicUser } from '../services/userPresenter.js';
import { AppError } from '../utils/AppError.js';
import { authRefreshPayload, emptyPayload, locationUpdatePayload, shareStartPayload } from '../validators/location.js';

/** Identity and bookkeeping for one socket. Identity comes only from the verified token. */
interface SocketData {
  userId: string;
  sessionId: string;
  tokenExp: number;
  events: { windowStart: number; count: number };
  lastSnapshotAt: number;
  lastRateNoticeAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvents = Record<string, (...args: any[]) => void>;
type AppSocket = Socket<AnyEvents, AnyEvents, AnyEvents, SocketData>;
type Ack = (response: { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }) => void;

const userRoom = (uid: string) => `user:${uid}`;
const sessionRoom = (sid: string) => `session:${sid}`;

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const publicLocation =(l: StoredLocation) => ({ userId: l.userId, lat: l.lat, lng: l.lng, accuracy: l.accuracy, ts: l.ts });

export interface RealtimeServer {
  io: Server;
  /** Tells clients to reconnect elsewhere, disconnects them, stops jobs and the adapter clients. */
  close(): Promise<void>;
}

export interface RealtimeOptions {
  pubClient: Redis;
  subClient: Redis;
  /** Redis channel prefix for the adapter; separate deployments sharing a Redis must differ. */
  adapterKey?: string;
  /** Intervals are configurable so tests can run them fast. */
  intervals?: Partial<{ sweepMs: number; tokenCheckMs: number; presenceRefreshMs: number }>;
}

/**
 * Socket.IO server for live location and social notifications. Every instance
 * uses the Redis adapter, so emitting to `user:{id}` reaches that user's
 * sockets on any instance. Sockets join only their own user and session
 * rooms; there is no shared room, so nothing is ever broadcast campus-wide.
 */
export function attachRealtime(http: HttpServer, c: Container, opts: RealtimeOptions): RealtimeServer {
  const { logger, config } = c;
  const { users } = c.repos;
  const { tokens, sessions, relationships, location, presence } = c.services;
  const log = logger.child({ component: 'realtime' });

  const io = new Server(http, {
    path: '/socket.io',
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: SOCKET_MAX_PAYLOAD_BYTES,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    cors: { origin: config.clientOrigins, credentials: true },
    // CORS does not apply to WebSocket upgrades, so the Origin is checked here.
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || config.clientOrigins.includes(origin));
    },
  });
  io.adapter(createAdapter(opts.pubClient, opts.subClient, { key: opts.adapterKey ?? 'vnav' }));

  // ── Handshake authentication ───────────────────────────────────────────────

  io.use(async (raw, next) => {
    const socket = raw as AppSocket;
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || token.length === 0 || token.length > 4096) throw AppError.unauthenticated();
      const claims = tokens.verifyAccess(token);
      if (!Types.ObjectId.isValid(claims.sub) || !Types.ObjectId.isValid(claims.sid)) throw AppError.unauthenticated();
      if (await sessions.isRevoked(claims.sid)) {
        throw AppError.unauthenticated('Session has ended', ErrorCode.SESSION_REVOKED);
      }
      const user = await users.findActiveById(new Types.ObjectId(claims.sub));
      if (!user) throw AppError.unauthenticated();
      socket.data = {
        userId: claims.sub,
        sessionId: claims.sid,
        tokenExp: claims.exp,
        events: { windowStart: Date.now(), count: 0 },
        lastSnapshotAt: 0,
        lastRateNoticeAt: 0,
      };
      next();
    } catch (err) {
      const e = err instanceof AppError ? err : AppError.unavailable();
      if (!(err instanceof AppError)) log.error({ err }, 'socket handshake failed');
      const error = new Error(e.message) as Error & { data: { code: string } };
      error.data = { code: e.code };
      next(error);
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Emits to the given friends only. Guards the empty case explicitly:
   * `io.to([])` would address no room and therefore broadcast to everyone.
   */
  const emitToFriends = (friendIds: Iterable<string>, event: string, payload: unknown) => {
    const rooms = [...friendIds].map(userRoom);
    if (rooms.length === 0) return;
    io.to(rooms).emit(event, payload);
  };

  /** Tells the user's friends about an online/offline change, only if the user allows it. */
  const announcePresence = async (uid: string, online: boolean, lastSeenAt: Date | null) => {
    const user = await users.findActiveById(new Types.ObjectId(uid));
    if (!user || !(user.privacy?.showOnlineStatus ?? true)) return;
    const friends = await relationships.friendIds(user._id);
    emitToFriends(friends, 'friend:presence', { userId: uid, online, lastSeenAt });
  };

  const buildSnapshot = async (uid: string) => {
    const me = new Types.ObjectId(uid);
    const friendIds = [...(await relationships.friendIds(me))];
    if (friendIds.length === 0) return { locations: [], presence: [] };
    const [friendUsers, locations, online] = await Promise.all([
      users.findActiveByIds(friendIds.map((id) => new Types.ObjectId(id))),
      location.friendLocations(me),
      presence.onlineSet(friendIds),
    ]);
    return {
      locations: locations.filter((l) => friendUsers.has(l.userId)).map(publicLocation),
      presence: [...friendUsers.values()]
        .filter((u) => u.privacy?.showOnlineStatus ?? true)
        .map((u) => ({ userId: u._id.toHexString(), online: online.has(u._id.toHexString()), lastSeenAt: u.lastSeenAt ?? null })),
    };
  };

  const shareStatePayload = (s: { sharing: boolean; startedAt: Date | null; expiresAt: Date | null }) => ({
    sharing: s.sharing,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
  });

  /** Per-socket flood guard. Returns false (and disconnects) when the client exceeds the burst. */
  const allowEvent = (socket: AppSocket): boolean => {
    const now = Date.now();
    const ev = socket.data.events;
    if (now - ev.windowStart > SOCKET_EVENT_WINDOW_MS) {
      ev.windowStart = now;
      ev.count = 0;
    }
    ev.count += 1;
    if (ev.count > SOCKET_EVENT_BURST) {
      log.warn({ userId: socket.data.userId }, 'socket event flood; disconnecting');
      socket.disconnect(true);
      return false;
    }
    return true;
  };

  /** Wraps an acknowledged handler: validation, flood guard, uniform { ok, data | error } replies. */
  const handle = <T>(socket: AppSocket, schema: ZodType<T>, fn: (payload: T) => Promise<unknown>) =>
    async (payload: unknown, ack?: unknown) => {
      const reply: Ack = typeof ack === 'function' ? (ack as Ack) : () => {};
      if (!allowEvent(socket)) return;
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        reply({ ok: false, error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid payload' } });
        return;
      }
      try {
        reply({ ok: true, data: await fn(parsed.data) });
      } catch (err) {
        if (err instanceof AppError) {
          reply({ ok: false, error: { code: err.code, message: err.message } });
        } else {
          log.error({ err }, 'socket handler failed');
          reply({ ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong' } });
        }
      }
    };

  const pending = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    pending.add(p);
    void p.finally(() => pending.delete(p));
  };

  // ── Connection ───────────────────────────────────────────────────────────

  io.on('connection', (raw) => {
    const socket = raw as AppSocket;
    const { userId, sessionId } = socket.data;
    const me = new Types.ObjectId(userId);
    void socket.join([userRoom(userId), sessionRoom(sessionId)]);

    track(
      (async () => {
        try {
          if (await presence.add(userId, socket.id)) await announcePresence(userId, true, null);
          socket.emit('location:share:state', shareStatePayload(await location.state(me)));
          socket.emit('friends:snapshot', await buildSnapshot(userId));
        } catch (err) {
          log.error({ err }, 'socket connect setup failed');
        }
      })(),
    );

    socket.on(
      'location:share:start',
      handle(socket, shareStartPayload, async ({ durationMinutes }) => {
        const state = shareStatePayload(await location.start(me, durationMinutes));
        socket.to(userRoom(userId)).emit('location:share:state', state); // the user's other tabs
        return state;
      }),
    );

    socket.on(
      'location:share:stop',
      handle(socket, emptyPayload, async () => {
        await location.stop(me, 'stopped');
        return { sharing: false };
      }),
    );

    socket.on(
      'friends:snapshot:request',
      handle(socket, emptyPayload, async () => {
        const now = Date.now();
        if (now - socket.data.lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS) throw AppError.rateLimited(SNAPSHOT_MIN_INTERVAL_MS / 1000);
        socket.data.lastSnapshotAt = now;
        return buildSnapshot(userId);
      }),
    );

    socket.on(
      'auth:refresh',
      handle(socket, authRefreshPayload, async ({ token }) => {
        const claims = tokens.verifyAccess(token);
        if (claims.sub !== userId || claims.sid !== sessionId || (await sessions.isRevoked(claims.sid))) {
          socket.disconnect(true);
          throw AppError.unauthenticated();
        }
        socket.data.tokenExp = claims.exp;
        return { exp: claims.exp };
      }),
    );

    socket.on('presence:heartbeat', () => {
      if (allowEvent(socket)) track(presence.refresh([{ uid: userId, socketId: socket.id }]).catch(() => {}));
    });

    // Fire-and-forget: rejections are reported with `location:rejected`, never an ack.
    socket.on('location:update', (payload: unknown) => {
      if (!allowEvent(socket)) return;
      const parsed = locationUpdatePayload.safeParse(payload);
      if (!parsed.success) {
        socket.emit('location:rejected', { code: LocationRejectCode.VALIDATION_ERROR });
        return;
      }
      track(
        (async () => {
          try {
            const outcome = await location.processUpdate(me, parsed.data);
            if (outcome.ok) {
              emitToFriends(outcome.recipients, 'friend:location', publicLocation(outcome.location));
              return;
            }
            if (outcome.code === LocationRejectCode.OFF_CAMPUS && outcome.offCampusRecipients) {
              emitToFriends(outcome.offCampusRecipients, 'friend:location:removed', { userId, reason: 'off_campus' });
            }
            if (outcome.code === LocationRejectCode.RATE_LIMITED) {
              const now = Date.now();
              if (now - socket.data.lastRateNoticeAt < RATE_LIMIT_NOTICE_INTERVAL_MS) return;
              socket.data.lastRateNoticeAt = now;
            }
            socket.emit('location:rejected', { code: outcome.code });
          } catch (err) {
            log.error({ err }, 'location update failed'); // never logs coordinates
          }
        })(),
      );
    });

    socket.on('disconnect', () => {
      track(
        (async () => {
          try {
            if (await presence.remove(userId, socket.id)) {
              const lastSeenAt = new Date();
              await users.setLastSeen(me, lastSeenAt);
              await announcePresence(userId, false, lastSeenAt);
            }
          } catch (err) {
            log.error({ err }, 'socket disconnect cleanup failed');
          }
        })(),
      );
    });
  });

  // ── Domain events → clients ──────────────────────────────────────────────

  const offs = [
    c.events.on('location.stopped', async ({ userId, reason }) => {
      const uid = userId.toHexString();
      io.to(userRoom(uid)).emit('location:share:state', { sharing: false, startedAt: null, expiresAt: null });
      const friends = await relationships.friendIds(userId);
      const removalReason: Record<LocationStopReason, string> = { stopped: 'stopped', expired: 'expired', signed_out: 'stopped' };
      emitToFriends(friends, 'friend:location:removed', { userId: uid, reason: removalReason[reason] });
    }),

    c.events.on('friend.ended', ({ a, b }) => {
      const [ua, ub] = [a.toHexString(), b.toHexString()];
      // The blocked or unfriended student sees only a removal, never the reason.
      io.to(userRoom(ua)).emit('friend:location:removed', { userId: ub, reason: 'revoked' });
      io.to(userRoom(ua)).emit('friendship:removed', { userId: ub });
      io.to(userRoom(ub)).emit('friend:location:removed', { userId: ua, reason: 'revoked' });
      io.to(userRoom(ub)).emit('friendship:removed', { userId: ua });
    }),

    c.events.on('friend.requestCreated', async ({ requestId, from, to, createdAt }) => {
      const sender = await users.findActiveById(from);
      if (!sender) return;
      io.to(userRoom(to.toHexString())).emit('friend:request:received', {
        requestId: requestId.toHexString(),
        from: toPublicUser(sender),
        createdAt,
      });
    }),

    c.events.on('friend.created', async ({ a, b, since }) => {
      const people = await users.findActiveByIds([a, b]);
      const [ua, ub] = [people.get(a.toHexString()), people.get(b.toHexString())];
      if (!ua || !ub) return;
      const notify = async (viewer: User, friend: User) => {
        const viewerId = viewer._id.toHexString();
        io.to(userRoom(viewerId)).emit('friend:request:accepted', { friend: toFriendUser(friend, since) });
        // A new friend who is already sharing appears straight away.
        const loc = await location.locationOf(friend._id.toHexString());
        if (loc) io.to(userRoom(viewerId)).emit('friend:location', publicLocation(loc));
      };
      await notify(ua, ub);
      await notify(ub, ua);
    }),

    c.events.on('session.revoked', ({ sessionIds, reason }) => {
      for (const sid of sessionIds) {
        const room = io.in(sessionRoom(sid.toHexString()));
        room.emit('session:revoked', { reason });
        room.disconnectSockets(true);
      }
    }),

    c.events.on('user.privacyChanged', async ({ userId }) => {
      const uid = userId.toHexString();
      const user = await users.findActiveById(userId);
      if (!user || !(await presence.isOnline(uid))) return;
      const friends = await relationships.friendIds(userId);
      const visible = user.privacy?.showOnlineStatus ?? true;
      // Turning it off makes the user simply look offline.
      emitToFriends(friends, 'friend:presence', { userId: uid, online: visible, lastSeenAt: null });
    }),
  ];

  // ── Background jobs ──────────────────────────────────────────────────────

  const intervals = {
    sweepMs: SHARE_SWEEP_INTERVAL_MS,
    tokenCheckMs: TOKEN_CHECK_INTERVAL_MS,
    presenceRefreshMs: PRESENCE_REFRESH_MS,
    ...opts.intervals,
  };
  const localSockets = () => [...io.of('/').sockets.values()] as AppSocket[];
  const guard = (name: string, fn: () => Promise<unknown>) => () => {
    track(fn().catch((err) => log.error({ err, job: name }, 'realtime job failed')));
  };

  const timers = [
    setInterval(guard('share-sweep', () => location.sweepExpired()), intervals.sweepMs),
    setInterval(
      guard('presence-refresh', () => presence.refresh(localSockets().map((s) => ({ uid: s.data.userId, socketId: s.id })))),
      intervals.presenceRefreshMs,
    ),
    setInterval(
      guard('token-check', async () => {
        const nowSec = Math.floor(Date.now() / 1000);
        for (const s of localSockets()) {
          if (nowSec > s.data.tokenExp + TOKEN_GRACE_SECONDS) {
            s.emit('auth:expired', { code: ErrorCode.TOKEN_EXPIRED });
            s.disconnect(true);
          }
        }
      }),
      intervals.tokenCheckMs,
    ),
  ];
  for (const t of timers) t.unref();

  return {
    io,
    async close() {
      for (const t of timers) clearInterval(t);
      for (const off of offs) off();
      io.local.emit('server:shutdown', { reconnectInMs: 1000 });
      // Close the transports rather than disconnecting the sockets: clients see
      // "transport close" and reconnect on their own (the load balancer sends them
      // to a healthy instance). A server-side disconnect would stop them retrying.
      // Engine.IO flushes the queued shutdown notice before closing. The shared
      // HTTP server is left for server.ts to close.
      io.engine.close();
      await waitUntil(() => io.of('/').sockets.size === 0, 2000);
      await Promise.allSettled([...pending]);
      await Promise.allSettled([opts.pubClient.quit(), opts.subClient.quit()]);
    },
  };
}
