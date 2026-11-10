import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

router.post("/add", async (req, res) => {
  try {
    const { friendCode } = req.body;
    if (!friendCode) {
      return res.status(400).json({ error: "Friend code is required" });
    }

    const target = await User.findOne({
      friendCode: friendCode.trim().toUpperCase(),
    });
    if (!target) {
      return res.status(404).json({ error: "No user found with that friend code" });
    }

    if (target._id.equals(req.user._id)) {
      return res.status(400).json({ error: "You cannot add yourself" });
    }

    if (req.user.friends.some((f) => f.equals(target._id))) {
      return res.status(409).json({ error: "Already friends" });
    }

    const alreadyRequested = target.friendRequests.some((r) =>
      r.from.equals(req.user._id)
    );
    if (alreadyRequested) {
      return res
        .status(409)
        .json({ error: "Friend request already sent" });
    }

    target.friendRequests.push({ from: req.user._id });
    await target.save();

    res.json({ message: `Friend request sent to ${target.name}` });
  } catch (err) {
    console.error("Add friend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/accept", async (req, res) => {
  try {
    const { requesterId } = req.body;
    if (!requesterId || !mongoose.Types.ObjectId.isValid(requesterId)) {
      return res.status(400).json({ error: "Valid requesterId is required" });
    }

    const currentUser = await User.findById(req.user._id);

    const reqIndex = currentUser.friendRequests.findIndex((r) =>
      r.from.equals(requesterId)
    );
    if (reqIndex === -1) {
      return res.status(404).json({ error: "No such friend request" });
    }
    currentUser.friendRequests.splice(reqIndex, 1);

    if (!currentUser.friends.some((f) => f.equals(requesterId))) {
      currentUser.friends.push(requesterId);
    }
    await currentUser.save();

    const requester = await User.findById(requesterId);
    if (requester && !requester.friends.some((f) => f.equals(currentUser._id))) {
      requester.friends.push(currentUser._id);
      await requester.save();
    }

    res.json({ message: "Friend request accepted" });
  } catch (err) {
    console.error("Accept friend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/reject", async (req, res) => {
  try {
    const { requesterId } = req.body;
    if (!requesterId || !mongoose.Types.ObjectId.isValid(requesterId)) {
      return res.status(400).json({ error: "Valid requesterId is required" });
    }

    const currentUser = await User.findById(req.user._id);
    const reqIndex = currentUser.friendRequests.findIndex((r) =>
      r.from.equals(requesterId)
    );
    if (reqIndex === -1) {
      return res.status(404).json({ error: "No such friend request" });
    }
    currentUser.friendRequests.splice(reqIndex, 1);
    await currentUser.save();

    res.json({ message: "Friend request rejected" });
  } catch (err) {
    console.error("Reject friend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("friends", "name studentId friendCode")
      .populate("friendRequests.from", "name studentId friendCode");

    res.json({
      friends: user.friends,
      pendingRequests: user.friendRequests,
    });
  } catch (err) {
    console.error("Friend list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
