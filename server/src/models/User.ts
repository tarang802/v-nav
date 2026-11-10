import { Schema, type InferSchemaType, type HydratedDocument, Types } from 'mongoose';
import { PENDING_ACCOUNT_TTL_SECONDS, ROLES, USER_STATUSES } from '../constants/auth.js';

export const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    regNo: { type: String, required: true, uppercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'student', required: true },
    status: { type: String, enum: USER_STATUSES, default: 'pending_verification', required: true },
    verification: {
      type: new Schema(
        { method: { type: String, enum: ['email_otp'], required: true }, verifiedAt: Date },
        { _id: false },
      ),
      default: null,
    },
    friendCode: { type: String, required: true },
    avatar: {
      type: new Schema({ key: String, url: String, updatedAt: Date }, { _id: false }),
      default: null,
    },
    privacy: {
      showOnlineStatus: { type: Boolean, default: true },
      allowFriendRequests: { type: Boolean, default: true },
    },
    friendCount: { type: Number, default: 0, min: 0 },
    lastSeenAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ friendCode: 1 }, { unique: true });
// Only one verified account per registration number; an unverified squatter cannot block the real student.
userSchema.index({ regNo: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
// Abandoned registrations are deleted automatically after 7 days.
userSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: PENDING_ACCOUNT_TTL_SECONDS,
    partialFilterExpression: { status: 'pending_verification' },
  },
);

export type User = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export type UserDoc = HydratedDocument<User>;
