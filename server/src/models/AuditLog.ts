import { Schema, type InferSchemaType, Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'register',
  'email_verified',
  'login_success',
  'login_failed',
  'account_locked',
  'logout',
  'logout_all',
  'session_revoked',
  'token_reuse_detected',
  'password_changed',
  'password_reset_requested',
  'password_reset',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditLogSchema = new Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    targetId: { type: Schema.Types.ObjectId, default: null },
    ipHash: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' },
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export type AuditLog = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };
