import { Schema, type InferSchemaType, Types } from 'mongoose';

/** One document per logged-in device. Rotation updates the document in place. */
export const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String, default: undefined },
    rotatedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 200, default: '' },
    ipHash: { type: String, default: '' },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'sessions' },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ previousTokenHash: 1 }, { sparse: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Session = InferSchemaType<typeof sessionSchema> & { _id: Types.ObjectId };
