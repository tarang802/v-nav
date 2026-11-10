import { Schema, type InferSchemaType, Types } from 'mongoose';

export const blockSchema = new Schema(
  {
    blocker: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'blocks', versionKey: false },
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocker: 1, createdAt: -1, _id: -1 });
blockSchema.index({ blocked: 1 });

export type Block = InferSchemaType<typeof blockSchema> & { _id: Types.ObjectId; createdAt: Date };
