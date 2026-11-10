import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = Router();

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/register", async (req, res) => {
  try {
    const { studentId, name, password } = req.body;

    if (!studentId || !name || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ studentId: studentId.trim() });
    if (existing) {
      return res.status(409).json({ error: "Student ID already registered" });
    }

    let user;
    let attempts = 0;
    while (attempts < 3) {
      try {
        user = await User.create({
          studentId: studentId.trim(),
          name: name.trim(),
          password,
        });
        break; 
      } catch (createErr) {
        if (createErr.code === 11000 && createErr.keyPattern?.friendCode) {
          attempts++;
          if (attempts >= 3) throw createErr;
          continue;
        }
        throw createErr;
      }
    }

    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toSafeObject() });
  } catch (err) {
    if (err.code === 11000) {
      // Check what field caused the dupe
      if (err.keyPattern?.friendCode) {
        return res.status(500).json({ error: "Code generation failed, please try again" });
      }
      return res.status(409).json({ error: "Student ID already registered" });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return res
        .status(400)
        .json({ error: "Student ID and password are required" });
    }

    const user = await User.findOne({ studentId: studentId.trim() });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(user._id);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("friends", "name studentId friendCode");
    res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
