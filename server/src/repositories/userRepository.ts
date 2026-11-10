import type { ClientSession, Types } from 'mongoose';
import type { Models } from '../models/index.js';
import type { User } from '../models/User.js';

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
}
