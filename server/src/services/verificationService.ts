import type { Types } from 'mongoose';
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../constants/auth.js';
import type { VerificationCodeRepository } from '../repositories/tokenRepositories.js';
import { hmacSha256, randomNumericCode, safeEqualHex } from '../utils/crypto.js';
import type { MailService } from './mailService.js';

export interface VerifiableUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
}

/**
 * Proves that a registrant is a student. The first implementation checks
 * control of an institutional mailbox. A roster or SSO verifier can implement
 * the same interface later without changing AuthService.
 */
export interface StudentVerifier {
  readonly method: 'email_otp';
  issue(user: VerifiableUser): Promise<void>;
  verify(userId: Types.ObjectId, submitted: string): Promise<boolean>;
}

export class EmailOtpVerifier implements StudentVerifier {
  readonly method = 'email_otp' as const;

  constructor(
    private readonly codes: VerificationCodeRepository,
    private readonly mail: MailService,
    private readonly otpSecret: string,
  ) {}

  private hash(userId: Types.ObjectId, code: string) {
    // Bound to the user so a hash cannot be replayed for another account.
    return hmacSha256(this.otpSecret, `${userId.toHexString()}:${code}`);
  }

  async issue(user: VerifiableUser): Promise<void> {
    const code = randomNumericCode(OTP_LENGTH);
    await this.codes.upsert(user._id, 'email_verification', this.hash(user._id, code), new Date(Date.now() + OTP_TTL_MS));
    await this.mail.sendVerificationCode(user.email, user.name, code, OTP_TTL_MS / 60_000);
  }

  async verify(userId: Types.ObjectId, submitted: string): Promise<boolean> {
    const record = await this.codes.find(userId, 'email_verification');
    if (!record) return false;
    // Count the attempt before comparing so parallel guesses cannot exceed the limit.
    const counted = await this.codes.incrementAttempts(record._id);
    if (!counted || counted.attempts > OTP_MAX_ATTEMPTS) {
      await this.codes.delete(record._id);
      return false;
    }
    const ok = safeEqualHex(this.hash(userId, submitted), counted.codeHash);
    if (ok) await this.codes.delete(record._id);
    return ok;
  }
}
