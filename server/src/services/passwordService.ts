import bcrypt from 'bcryptjs';
import { BCRYPT_COST, PASSWORD_MAX, PASSWORD_MIN } from '../constants/auth.js';
import { COMMON_PASSWORDS } from '../constants/commonPasswords.js';
import { ErrorCode } from '../constants/errorCodes.js';
import { AppError } from '../utils/AppError.js';

export class PasswordService {
  /** Hash compared against when the user does not exist, so timing does not reveal accounts. */
  private readonly dummyHash: string;

  constructor(private readonly cost = BCRYPT_COST) {
    this.dummyHash = bcrypt.hashSync('vnav-dummy-password-for-timing', cost);
  }

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  /** Always performs one bcrypt comparison, even when `hash` is missing. */
  async verify(password: string, hash: string | null | undefined): Promise<boolean> {
    const ok = await bcrypt.compare(password, hash ?? this.dummyHash);
    return ok && Boolean(hash);
  }

  /** Throws WEAK_PASSWORD with a reason. Length bounds are also enforced by validators. */
  assertStrong(password: string, context: { email?: string; regNo?: string; name?: string } = {}): void {
    const reject = (message: string) => {
      throw new AppError(400, ErrorCode.WEAK_PASSWORD, message);
    };
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      reject(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`);
    }
    const lower = password.toLowerCase();
    if (COMMON_PASSWORDS.has(lower)) reject('This password is too common');
    if (new Set(lower).size < 4) reject('Password needs more variety of characters');
    const localPart = context.email?.split('@')[0]?.toLowerCase();
    const personal = [localPart, context.regNo?.toLowerCase(), context.name?.toLowerCase().replace(/\s+/g, '')];
    for (const p of personal) {
      if (p && p.length >= 4 && lower.includes(p)) reject('Password must not contain your email, name or registration number');
    }
  }
}
