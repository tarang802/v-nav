import type { ClientSession, Types } from 'mongoose';
import type { Models } from '../models/index.js';
import type { User } from '../models/User.js';
import { MAX_FRIENDS } from '../constants/social.js';

export type UserWithHash = User & { passwordHash: string };

export interface NewUser {
  name: string;
  email: string;
  regNo: string;
  passwordHash: string;
  friendCode: string;
}

export class UserRepository {
  constructor(private readonly models: Models) {}

  findById(id: Types.ObjectId | string) {
    return this.models.User.findById(id).lean<User>().exec();
  }

  findByEmail(email: string) {
    return this.models.User.findOne({ email }).lean<User>().exec();
  }

  findByEmailWithHash(email: string) {
    return this.models.User.findOne({ email }).select('+passwordHash').lean<UserWithHash>().exec();
  }

  findByIdWithHash(id: Types.ObjectId | string) {
    return this.models.User.findById(id).select('+passwordHash').lean<UserWithHash>().exec();
  }

  existsActiveWithRegNo(regNo: string, excludeId?: Types.ObjectId) {
    return this.models.User.exists({
      regNo,
      status: 'active',
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).exec();
  }

  async create(data: NewUser): Promise<User> {
    const doc = await this.models.User.create(data);
    return doc.toObject() as User;
  }

  /** Re-registration of a still-unverified account replaces its details. */
  updatePending(id: Types.ObjectId, data: Pick<NewUser, 'name' | 'regNo' | 'passwordHash'>) {
    return this.models.User.updateOne(
      { _id: id, status: 'pending_verification' },
      { $set: { ...data, passwordChangedAt: new Date(), createdAt: new Date() } },
      { timestamps: false },
    ).exec();
  }

  activate(id: Types.ObjectId, session?: ClientSession) {
    return this.models.User.findOneAndUpdate(
      { _id: id, status: 'pending_verification' },
      { $set: { status: 'active', verification: { method: 'email_otp', verifiedAt: new Date() } } },
      { new: true, session: session ?? null },
    )
      .lean<User>()
      .exec();
  }

  setPassword(id: Types.ObjectId, passwordHash: string) {
    return this.models.User.updateOne(
      { _id: id },
      { $set: { passwordHash, passwordChangedAt: new Date() } },
    ).exec();
  }

  findActiveByFriendCode(friendCode: string) {
    return this.models.User.findOne({ friendCode, status: 'active' }).lean<User>().exec();
  }

  findActiveById(id: Types.ObjectId) {
    return this.models.User.findOne({ _id: id, status: 'active' }).lean<User>().exec();
  }

  /** Active users by id, keyed by hex id. Inactive or missing ids are simply absent. */
  async findActiveByIds(ids: Types.ObjectId[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const rows = await this.models.User.find({ _id: { $in: ids }, status: 'active' }).lean<User[]>().exec();
    return new Map(rows.map((u) => [u._id.toHexString(), u]));
  }

  /** Users by id regardless of status, keyed by hex id. */
  async findByIds(ids: Types.ObjectId[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const rows = await this.models.User.find({ _id: { $in: ids } }).lean<User[]>().exec();
    return new Map(rows.map((u) => [u._id.toHexString(), u]));
  }

  /**
   * Adds one friend to the counter, refusing (returns false) if the user is not
   * active or already has MAX_FRIENDS. Runs inside the friendship transaction.
   */
  async incrementFriendCount(id: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const r = await this.models.User.updateOne(
      { _id: id, status: 'active', friendCount: { $lt: MAX_FRIENDS } },
      { $inc: { friendCount: 1 } },
      { session, timestamps: false },
    ).exec();
    return r.modifiedCount === 1;
  }

  decrementFriendCount(id: Types.ObjectId, session: ClientSession) {
    return this.models.User.updateOne(
      { _id: id, friendCount: { $gt: 0 } },
      { $inc: { friendCount: -1 } },
      { session, timestamps: false },
    ).exec();
  }

  updateProfile(id: Types.ObjectId, data: { name?: string }) {
    return this.models.User.findOneAndUpdate({ _id: id, status: 'active' }, { $set: data }, { new: true })
      .lean<User>()
      .exec();
  }

  updatePrivacy(id: Types.ObjectId, privacy: { showOnlineStatus?: boolean; allowFriendRequests?: boolean }) {
    const set: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(privacy)) if (v !== undefined) set[`privacy.${k}`] = v;
    return this.models.User.findOneAndUpdate({ _id: id, status: 'active' }, { $set: set }, { new: true })
      .lean<User>()
      .exec();
  }
}
