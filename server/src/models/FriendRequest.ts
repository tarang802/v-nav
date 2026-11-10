import { Schema, type InferSchemaType, Types } from 'mongoose';

/**
 * A pending friend request. Accept, reject and cancel delete the document.
 *
 * `pairKey` is the two user ids sorted and joined. Its unique index allows only
 * one pending request per pair in *either* direction, so two students sending
 * each other a request at the same instant cannot create a crossing pair; the
 * loser of the race sees the other request and accepts it instead.
 */
export const friendRequestSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pairKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'friend_requests' },
);

friendRequestSchema.index({ pairKey: 1 }, { unique: true });
friendRequestSchema.index({ to: 1, createdAt: -1, _id: -1 });
friendRequestSchema.index({ from: 1, createdAt: -1, _id: -1 });

export type FriendRequest = InferSchemaType<typeof friendRequestSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export const pairKeyOf = (a: Types.ObjectId, b: Types.ObjectId): string => {
  const [x, y] = [a.toHexString(), b.toHexString()].sort();
  return `${x}:${y}`;
};
