import type { Types } from 'mongoose';
import type { Models } from '../models/index.js';
import type { Session } from '../models/Session.js';

export interface NewSession {
  userId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  userAgent: string;
  ipHash: string;
  expiresAt: Date;
}

export class SessionRepository {
  constructor(private readonly models: Models) {}

  async create(data: NewSession): Promise<Session> {
    const doc = await this.models.Session.create({ ...data, lastUsedAt: new Date() });
    return doc.toObject() as Session;
  }

  findById(id: Types.ObjectId | string) {
    return this.models.Session.findById(id).lean<Session>().exec();
  }

  findByTokenHash(tokenHash: string) {
    return this.models.Session.findOne({ tokenHash }).lean<Session>().exec();
  }

  findByPreviousTokenHash(tokenHash: string) {
    return this.models.Session.findOne({ previousTokenHash: tokenHash }).lean<Session>().exec();
  }

  /**
   * Atomic rotation: only succeeds if the presented hash is still current and
   * the session is live, so two concurrent refreshes cannot both win.
   */
  rotate(currentHash: string, nextHash: string, expiresAt: Date) {
    const now = new Date();
    return this.models.Session.findOneAndUpdate(
      { tokenHash: currentHash, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: {
          tokenHash: nextHash,
          previousTokenHash: currentHash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt,
        },
      },
      { new: true },
    )
      .lean<Session>()
      .exec();
  }

  listActiveForUser(userId: Types.ObjectId | string) {
    return this.models.Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 })
      .limit(100)
      .lean<Session[]>()
      .exec();
  }

  /** Returns the ids that were actually revoked (were live before). */
  async revoke(filter: Record<string, unknown>, reason: string): Promise<Types.ObjectId[]> {
    const live = await this.models.Session.find({ ...filter, revokedAt: null }, { _id: 1 })
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    if (live.length === 0) return [];
    const ids = live.map((s) => s._id);
    await this.models.Session.updateMany(
      { _id: { $in: ids }, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ).exec();
    return ids;
  }
}
