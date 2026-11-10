import type { Types } from 'mongoose';
import type { Models } from '../models/index.js';
import type { VerificationCode } from '../models/VerificationCode.js';
import type { PasswordResetToken } from '../models/PasswordResetToken.js';

type Purpose = 'email_verification';

export class VerificationCodeRepository {
  constructor(private readonly models: Models) {}

  /** One live code per user and purpose; issuing a new one replaces the old. */
  upsert(userId: Types.ObjectId, purpose: Purpose, codeHash: string, expiresAt: Date) {
    return this.models.VerificationCode.updateOne(
      { userId, purpose },
      { $set: { codeHash, expiresAt, attempts: 0 } },
      { upsert: true },
    ).exec();
  }

  find(userId: Types.ObjectId, purpose: Purpose) {
    return this.models.VerificationCode.findOne({ userId, purpose, expiresAt: { $gt: new Date() } })
      .lean<VerificationCode>()
      .exec();
  }

  /** Atomically counts an attempt; returns the doc after increment, or null if gone. */
  incrementAttempts(id: Types.ObjectId) {
    return this.models.VerificationCode.findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true })
      .lean<VerificationCode>()
      .exec();
  }

  delete(id: Types.ObjectId) {
    return this.models.VerificationCode.deleteOne({ _id: id }).exec();
  }
}

export class PasswordResetRepository {
  constructor(private readonly models: Models) {}

  async create(userId: Types.ObjectId, tokenHash: string, expiresAt: Date) {
    // Only the newest link works.
    await this.models.PasswordResetToken.deleteMany({ userId, usedAt: null }).exec();
    await this.models.PasswordResetToken.create({ userId, tokenHash, expiresAt });
  }

  findValid(tokenHash: string) {
    return this.models.PasswordResetToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } })
      .lean<PasswordResetToken>()
      .exec();
  }

  /** Marks the token used if it is valid; returns it, or null. Single use, atomic. */
  consume(tokenHash: string) {
    return this.models.PasswordResetToken.findOneAndUpdate(
      { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true },
    )
      .lean<PasswordResetToken>()
      .exec();
  }
}
