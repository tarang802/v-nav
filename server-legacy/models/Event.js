import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Event name is required"],
      trim: true,
      maxlength: [100, "Event name too long"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description too long"],
      default: "",
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    // "friends" = visible only to creator's friends
    visibility: {
      type: String,
      enum: ["friends"],
      default: "friends",
    },
  },
  { timestamps: true }
);

// Index for geospatial-style queries and efficient friend lookups
eventSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model("Event", eventSchema);
