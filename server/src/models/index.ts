import type { Connection, Model } from 'mongoose';
import { userSchema, type User } from './User.js';
import { sessionSchema, type Session } from './Session.js';
import { verificationCodeSchema, type VerificationCode } from './VerificationCode.js';
import { passwordResetTokenSchema, type PasswordResetToken } from './PasswordResetToken.js';
import { auditLogSchema, type AuditLog } from './AuditLog.js';

export interface Models {
  User: Model<User>;
  Session: Model<Session>;
  VerificationCode: Model<VerificationCode>;
  PasswordResetToken: Model<PasswordResetToken>;
  AuditLog: Model<AuditLog>;
}

/** Registers every model on the given connection. No global mongoose models are used. */
export function registerModels(conn: Connection): Models {
  return {
    User: conn.model<User>('User', userSchema),
    Session: conn.model<Session>('Session', sessionSchema),
    VerificationCode: conn.model<VerificationCode>('VerificationCode', verificationCodeSchema),
    PasswordResetToken: conn.model<PasswordResetToken>('PasswordResetToken', passwordResetTokenSchema),
    AuditLog: conn.model<AuditLog>('AuditLog', auditLogSchema),
  };
}

export async function syncAllIndexes(models: Models): Promise<void> {
  for (const model of Object.values(models) as Model<unknown>[]) {
    await model.syncIndexes();
  }
}
