import { Schema, type InferSchemaType, Types } from 'mongoose';

/**
 * One directed edge of a friendship. Every friendship is two edges (A→B and
 * B→A), created and deleted together inside one transaction, so listing a
 * user's friends is a single indexed equality query.
 */
export const friendshipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    friendId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    since: { type: Date, required: true },
  },
  { collection: 'friendships', versionKey: false },
);

friendshipSchema.index({ userId: 1, friendId: 1 }, { unique: true });
// _id breaks ties between friendships created in the same millisecond, for stable cursors.
friendshipSchema.index({ userId: 1, since: -1, _id: -1 });

export type Friendship = InferSchemaType<typeof friendshipSchema> & { _id: Types.ObjectId };
