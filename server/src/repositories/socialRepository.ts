import type { ClientSession, Types } from 'mongoose';
import type { Models } from '../models/index.js';
import { pairKeyOf, type FriendRequest } from '../models/FriendRequest.js';
import type { Friendship } from '../models/Friendship.js';
import type { Block } from '../models/Block.js';
import { afterCursor, type CursorKey } from '../utils/cursor.js';

type Id = Types.ObjectId;
const opt = (session?: ClientSession) => (session ? { session } : {});

/**
 * Persistence for friend requests, friendship edges and blocks. Every write
 * accepts an optional transaction session; FriendService decides the
 * transaction boundaries.
 */
export class SocialRepository {
  constructor(private readonly models: Models) {}

  // ── Friend requests ──────────────────────────────────────────────────────

  findRequestBetween(a: Id, b: Id, session?: ClientSession) {
    return this.models.FriendRequest.findOne({ pairKey: pairKeyOf(a, b) }, null, opt(session))
      .lean<FriendRequest>()
      .exec();
  }

  async createRequest(from: Id, to: Id, session?: ClientSession): Promise<FriendRequest> {
    const [doc] = await this.models.FriendRequest.create([{ from, to, pairKey: pairKeyOf(from, to) }], opt(session));
    return doc!.toObject() as FriendRequest;
  }

  countOutgoing(from: Id, session?: ClientSession) {
    return this.models.FriendRequest.countDocuments({ from }, opt(session)).exec();
  }

  /** Deletes the request only if `field` matches the acting user (recipient or sender). */
  deleteRequestFor(id: Id, field: 'to' | 'from', userId: Id, session?: ClientSession) {
    return this.models.FriendRequest.findOneAndDelete({ _id: id, [field]: userId }, opt(session))
      .lean<FriendRequest>()
      .exec();
  }

  deleteRequestsBetween(a: Id, b: Id, session?: ClientSession) {
    return this.models.FriendRequest.deleteMany({ pairKey: pairKeyOf(a, b) }, opt(session)).exec();
  }

  listRequests(field: 'to' | 'from', userId: Id, limit: number, cursor: CursorKey | null) {
    return this.models.FriendRequest.find({ [field]: userId, ...afterCursor('createdAt', cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<FriendRequest[]>()
      .exec();
  }

  // ── Friendships ──────────────────────────────────────────────────────────

  findEdge(userId: Id, friendId: Id, session?: ClientSession) {
    return this.models.Friendship.findOne({ userId, friendId }, null, opt(session)).lean<Friendship>().exec();
  }

  async createEdges(a: Id, b: Id, since: Date, session?: ClientSession): Promise<void> {
    await this.models.Friendship.insertMany(
      [
        { userId: a, friendId: b, since },
        { userId: b, friendId: a, since },
      ],
      { ...opt(session), ordered: true },
    );
  }

  /** Deletes both edges; returns how many were removed (0 or 2 in a consistent database). */
  async deleteEdges(a: Id, b: Id, session?: ClientSession): Promise<number> {
    const r = await this.models.Friendship.deleteMany(
      { $or: [{ userId: a, friendId: b }, { userId: b, friendId: a }] },
      opt(session),
    ).exec();
    return r.deletedCount;
  }

  listFriends(userId: Id, limit: number, cursor: CursorKey | null) {
    return this.models.Friendship.find({ userId, ...afterCursor('since', cursor) })
      .sort({ since: -1, _id: -1 })
      .limit(limit)
      .lean<Friendship[]>()
      .exec();
  }

  async allFriendIds(userId: Id): Promise<Id[]> {
    const rows = await this.models.Friendship.find({ userId }, { friendId: 1, _id: 0 }).lean<{ friendId: Id }[]>().exec();
    return rows.map((r) => r.friendId);
  }

  // ── Blocks ───────────────────────────────────────────────────────────────

  /** Inserts the block; returns false if it already existed. */
  async createBlock(blocker: Id, blocked: Id, session?: ClientSession): Promise<boolean> {
    const r = await this.models.Block.updateOne(
      { blocker, blocked },
      { $setOnInsert: { blocker, blocked, createdAt: new Date() } },
      { upsert: true, timestamps: false, ...opt(session) },
    ).exec();
    return r.upsertedCount === 1;
  }

  async deleteBlock(blocker: Id, blocked: Id): Promise<boolean> {
    const r = await this.models.Block.deleteOne({ blocker, blocked }).exec();
    return r.deletedCount === 1;
  }

  blockBetween(a: Id, b: Id, session?: ClientSession) {
    return this.models.Block.exists({ $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }] })
      .session(session ?? null)
      .exec();
  }

  listBlocks(blocker: Id, limit: number, cursor: CursorKey | null) {
    return this.models.Block.find({ blocker, ...afterCursor('createdAt', cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<Block[]>()
      .exec();
  }

  /** Everyone in a block relationship with the user, in either direction. */
  async allBlockedEitherWay(userId: Id): Promise<Id[]> {
    const rows = await this.models.Block.find(
      { $or: [{ blocker: userId }, { blocked: userId }] },
      { blocker: 1, blocked: 1, _id: 0 },
    )
      .lean<{ blocker: Id; blocked: Id }[]>()
      .exec();
    return rows.map((r) => (r.blocker.equals(userId) ? r.blocked : r.blocker));
  }
}
