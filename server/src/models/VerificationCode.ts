import { Schema, type InferSchemaType, Types } from 'mongoose';

export const verificationCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['email_verification'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'verification_codes' },
);

verificationCodeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type VerificationCode = InferSchemaType<typeof verificationCodeSchema> & { _id: Types.ObjectId };
