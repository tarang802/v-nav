import type { ClientSession, Connection, Types } from 'mongoose';
import { ErrorCode } from '../constants/errorCodes.js';
import { MAX_OUTGOING_REQUESTS } from '../constants/social.js';
import type { FriendRequest } from '../models/FriendRequest.js';
import type { User } from '../models/User.js';
import type { DomainEvents } from '../events/domainEvents.js';
import type { Logger } from '../observability/logger.js';
import type { SocialRepository } from '../repositories/socialRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';
import { AppError } from '../utils/AppError.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';
import { isDuplicateKey } from '../utils/mongo.js';
import type { AuditService } from './auditService.js';
import { Limits, type RateLimiter } from './rateLimiter.js';
import type { RelationshipCache } from './relationshipCache.js';
import { toFriendUser, toPublicUser, toSelfUser, type FriendUser, type PublicUser } from './userPresenter.js';

type Id = Types.ObjectId;

export type Relationship = 'self' | 'none' | 'friends' | 'request_sent' | 'request_received';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PageQuery {
  limit: number;
  cursor?: string | undefined;
}

export type SendRequestResult =
  | { kind: 'requested'; request: { id: string; to: PublicUser; createdAt: Date } }
  | { kind: 'accepted'; friend: FriendUser };

export interface FriendServiceDeps {
  mongo: Connection;
  users: UserRepository;
  social: SocialRepository;
  cache: RelationshipCache;
  limiter: RateLimiter;
  audit: AuditService;
  events: DomainEvents;
  logger: Logger;
}

// Same response for unknown, inactive and blocked users, so a block cannot be detected.
const userNotFound = () => AppError.notFound('User not found');
const requestNotFound = () => AppError.notFound('Friend request not found');

/**
 * Friend requests, friendships and blocks. Every multi-document change runs in
 * one MongoDB transaction (snapshot read, majority write); caches are
 * invalidated only after the commit.
 */
export class FriendService {
  constructor(private readonly d: FriendServiceDeps) {}

  // ── Lookup ───────────────────────────────────────────────────────────────

  async lookupByCode(viewerId: Id, friendCode: string) {
    await this.d.limiter.consume(Limits.lookupUser, viewerId.toHexString());
    const target = await this.d.users.findActiveByFriendCode(friendCode);
    if (!target) throw userNotFound();
    if (!target._id.equals(viewerId) && (await this.d.cache.isBlockedEitherWay(viewerId, target._id))) {
      throw userNotFound();
    }
    return {
      user: toPublicUser(target),
      relationship: await this.relationshipWith(viewerId, target._id),
      acceptsRequests: target.privacy?.allowFriendRequests ?? true,
    };
  }

  async getUser(viewerId: Id, targetId: Id) {
    if (targetId.equals(viewerId)) {
      const self = await this.d.users.findActiveById(viewerId);
      if (!self) throw AppError.unauthenticated();
      return { user: toSelfUser(self), relationship: 'self' as Relationship };
    }
    const target = await this.d.users.findActiveById(targetId);
    if (!target || (await this.d.cache.isBlockedEitherWay(viewerId, targetId))) throw userNotFound();
    const edge = await this.d.social.findEdge(viewerId, targetId);
    if (edge) return { user: toFriendUser(target, edge.since), relationship: 'friends' as Relationship };
    return { user: toPublicUser(target), relationship: await this.relationshipWith(viewerId, targetId) };
  }

  private async relationshipWith(viewerId: Id, targetId: Id): Promise<Relationship> {
    if (viewerId.equals(targetId)) return 'self';
    if (await this.d.social.findEdge(viewerId, targetId)) return 'friends';
    const req = await this.d.social.findRequestBetween(viewerId, targetId);
    if (!req) return 'none';
    return req.from.equals(viewerId) ? 'request_sent' : 'request_received';
  }

  // ── Requests ─────────────────────────────────────────────────────────────

  /**
   * Sends a request by friend code. If the target already sent one to the
   * viewer, that request is accepted instead (no crossing requests).
   */
  async sendRequest(viewerId: Id, friendCode: string): Promise<SendRequestResult> {
    await this.d.limiter.consume(Limits.friendRequestUser, viewerId.toHexString());
    const target = await this.d.users.findActiveByFriendCode(friendCode);
    if (!target) throw userNotFound();
    if (target._id.equals(viewerId)) {
      throw AppError.validation([{ path: 'body.friendCode', message: 'That is your own friend code' }]);
    }

    // One retry covers the race where the other student's request to us commits
    // between our check and our insert: the retry sees it and accepts it.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.sendOnce(viewerId, target);
      } catch (err) {
        if (!isDuplicateKey(err, 'pairKey')) throw err;
        if (attempt > 0) {
          throw AppError.conflict(ErrorCode.FRIEND_REQUEST_EXISTS, 'A friend request between you already exists');
        }
      }
    }
  }

  private async sendOnce(viewerId: Id, target: User): Promise<SendRequestResult> {
    const outcome = await this.tx(async (session) => {
      if (await this.d.social.blockBetween(viewerId, target._id, session)) throw userNotFound();
      if (await this.d.social.findEdge(viewerId, target._id, session)) {
        throw AppError.conflict(ErrorCode.ALREADY_FRIENDS, 'You are already friends');
      }
      const existing = await this.d.social.findRequestBetween(viewerId, target._id, session);
      if (existing?.from.equals(viewerId)) {
        throw AppError.conflict(ErrorCode.FRIEND_REQUEST_EXISTS, 'Friend request already sent');
      }
      if (existing) {
        const { since } = await this.acceptInTx(existing, viewerId, session);
        return { kind: 'accepted' as const, since };
      }
      if (!(target.privacy?.allowFriendRequests ?? true)) {
        throw AppError.forbidden('This student is not accepting friend requests', ErrorCode.FRIEND_REQUESTS_DISABLED);
      }
      if ((await this.d.social.countOutgoing(viewerId, session)) >= MAX_OUTGOING_REQUESTS) {
        throw AppError.conflict(
          ErrorCode.FRIEND_LIMIT_REACHED,
          `You have ${MAX_OUTGOING_REQUESTS} pending requests; cancel some before sending more`,
        );
      }
      return { kind: 'requested' as const, request: await this.d.social.createRequest(viewerId, target._id, session) };
    });

    if (outcome.kind === 'accepted') {
      await this.d.cache.invalidate(['friends'], [viewerId, target._id]);
      await this.d.events.emit('friend.created', { a: viewerId, b: target._id, since: outcome.since });
      return { kind: 'accepted', friend: toFriendUser(target, outcome.since) };
    }
    const req = outcome.request;
    await this.d.events.emit('friend.requestCreated', { requestId: req._id, from: viewerId, to: target._id, createdAt: req.createdAt });
    return {
      kind: 'requested',
      request: { id: req._id.toHexString(), to: toPublicUser(target), createdAt: req.createdAt },
    };
  }

  async acceptRequest(viewerId: Id, requestId: Id): Promise<{ friend: FriendUser }> {
    const { since, friendId } = await this.tx(async (session) => {
      const req = await this.d.social.deleteRequestFor(requestId, 'to', viewerId, session);
      if (!req) throw requestNotFound();
      const r = await this.acceptInTx(req, viewerId, session, { alreadyDeleted: true });
      return { since: r.since, friendId: req.from };
    });
    await this.d.cache.invalidate(['friends'], [viewerId, friendId]);
    await this.d.events.emit('friend.created', { a: viewerId, b: friendId, since });
    const friend = await this.d.users.findActiveById(friendId);
    if (!friend) throw requestNotFound();
    return { friend: toFriendUser(friend, since) };
  }

  /** Creates the friendship for `req` (whose recipient is `viewerId`) inside the caller's transaction. */
  private async acceptInTx(
    req: FriendRequest,
    viewerId: Id,
    session: ClientSession,
    opts: { alreadyDeleted?: boolean } = {},
  ): Promise<{ since: Date }> {
    const other = req.from;
    if (!opts.alreadyDeleted) {
      const deleted = await this.d.social.deleteRequestFor(req._id, 'to', viewerId, session);
      if (!deleted) throw requestNotFound();
    }
    if (await this.d.social.blockBetween(viewerId, other, session)) throw requestNotFound();

    // Conditional increments enforce MAX_FRIENDS and that both accounts are still active.
    if (!(await this.d.users.incrementFriendCount(viewerId, session))) {
      throw AppError.conflict(ErrorCode.FRIEND_LIMIT_REACHED, 'You have reached the friend limit');
    }
    if (!(await this.d.users.incrementFriendCount(other, session))) {
      throw AppError.conflict(ErrorCode.FRIEND_LIMIT_REACHED, 'This student cannot add more friends');
    }

    const since = new Date();
    try {
      await this.d.social.createEdges(viewerId, other, since, session);
    } catch (err) {
      if (isDuplicateKey(err, 'friendId')) {
        throw AppError.conflict(ErrorCode.ALREADY_FRIENDS, 'You are already friends');
      }
      throw err;
    }
    return { since };
  }

  async rejectRequest(viewerId: Id, requestId: Id): Promise<void> {
    if (!(await this.d.social.deleteRequestFor(requestId, 'to', viewerId))) throw requestNotFound();
  }

  async cancelRequest(viewerId: Id, requestId: Id): Promise<void> {
    if (!(await this.d.social.deleteRequestFor(requestId, 'from', viewerId))) throw requestNotFound();
  }

  async listIncoming(viewerId: Id, q: PageQuery) {
    const rows = await this.d.social.listRequests('to', viewerId, q.limit + 1, decodeCursor(q.cursor));
    const { page, nextCursor } = this.paginate(rows, q.limit, (r) => r.createdAt);
    const users = await this.d.users.findActiveByIds(page.map((r) => r.from));
    const items = page.flatMap((r) => {
      const u = users.get(r.from.toHexString());
      return u ? [{ id: r._id.toHexString(), from: toPublicUser(u), createdAt: r.createdAt }] : [];
    });
    return { items, nextCursor };
  }

  async listOutgoing(viewerId: Id, q: PageQuery) {
    const rows = await this.d.social.listRequests('from', viewerId, q.limit + 1, decodeCursor(q.cursor));
    const { page, nextCursor } = this.paginate(rows, q.limit, (r) => r.createdAt);
    const users = await this.d.users.findActiveByIds(page.map((r) => r.to));
    const items = page.flatMap((r) => {
      const u = users.get(r.to.toHexString());
      return u ? [{ id: r._id.toHexString(), to: toPublicUser(u), createdAt: r.createdAt }] : [];
    });
    return { items, nextCursor };
  }

  // ── Friendships ──────────────────────────────────────────────────────────

  async listFriends(viewerId: Id, q: PageQuery): Promise<Page<FriendUser>> {
    const rows = await this.d.social.listFriends(viewerId, q.limit + 1, decodeCursor(q.cursor));
    const { page, nextCursor } = this.paginate(rows, q.limit, (r) => r.since);
    const users = await this.d.users.findActiveByIds(page.map((r) => r.friendId));
    const items = page.flatMap((r) => {
      const u = users.get(r.friendId.toHexString());
      return u ? [toFriendUser(u, r.since)] : [];
    });
    return { items, nextCursor };
  }

  async unfriend(viewerId: Id, friendId: Id): Promise<void> {
    await this.tx(async (session) => {
      const removed = await this.d.social.deleteEdges(viewerId, friendId, session);
      if (removed === 0) throw AppError.notFound('You are not friends with this student');
      await this.d.users.decrementFriendCount(viewerId, session);
      await this.d.users.decrementFriendCount(friendId, session);
    });
    await this.d.cache.invalidate(['friends'], [viewerId, friendId]);
    await this.d.events.emit('friend.ended', { a: viewerId, b: friendId });
  }

  // ── Blocks ───────────────────────────────────────────────────────────────

  /** Blocks a user: removes the friendship and any pending request in both directions. Idempotent. */
  async block(viewerId: Id, targetId: Id, ipHash: string): Promise<void> {
    if (targetId.equals(viewerId)) {
      throw AppError.validation([{ path: 'body.userId', message: 'You cannot block yourself' }]);
    }
    if (!(await this.d.users.findById(targetId))) throw userNotFound();

    const created = await this.tx(async (session) => {
      const isNew = await this.d.social.createBlock(viewerId, targetId, session);
      if ((await this.d.social.deleteEdges(viewerId, targetId, session)) > 0) {
        await this.d.users.decrementFriendCount(viewerId, session);
        await this.d.users.decrementFriendCount(targetId, session);
      }
      await this.d.social.deleteRequestsBetween(viewerId, targetId, session);
      return isNew;
    });

    await this.d.cache.invalidate(['friends', 'blocks'], [viewerId, targetId]);
    await this.d.events.emit('friend.ended', { a: viewerId, b: targetId });
    if (created) await this.d.audit.record({ action: 'user_blocked', actorId: viewerId, targetId, ipHash });
  }

  /** Removes the block. Does not restore any friendship. Idempotent. */
  async unblock(viewerId: Id, targetId: Id, ipHash: string): Promise<void> {
    if (await this.d.social.deleteBlock(viewerId, targetId)) {
      await this.d.cache.invalidate(['blocks'], [viewerId, targetId]);
      await this.d.audit.record({ action: 'user_unblocked', actorId: viewerId, targetId, ipHash });
    }
  }

  async listBlocks(viewerId: Id, q: PageQuery) {
    const rows = await this.d.social.listBlocks(viewerId, q.limit + 1, decodeCursor(q.cursor));
    const { page, nextCursor } = this.paginate(rows, q.limit, (r) => r.createdAt);
    // Listed even if the blocked account is suspended, so it can still be unblocked.
    const users = await this.d.users.findByIds(page.map((r) => r.blocked));
    const items = page.flatMap((r) => {
      const u = users.get(r.blocked.toHexString());
      return u ? [{ user: toPublicUser(u), createdAt: r.createdAt }] : [];
    });
    return { items, nextCursor };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private tx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    // Mongoose retries the callback on transient errors such as write conflicts between concurrent transactions.
    return this.d.mongo.transaction(fn, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  }

  private paginate<T extends { _id: Id }>(rows: T[], limit: number, timeOf: (r: T) => Date) {
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeCursor(timeOf(last), last._id) : null;
    return { page, nextCursor };
  }

}
