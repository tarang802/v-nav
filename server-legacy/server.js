import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import friendRoutes from "./routes/friends.js";
import eventRoutes from "./routes/events.js";
import { registerSocketHandlers } from "./sockets/index.js";

dotenv.config()

const PORT = process.env.PORT || 3000
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vnav'

// Support comma-separated origins: "http://localhost:5173,https://v-nav.vercel.app"
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173']

// ── Express app ──────────────────────────────────────────────
const app = express()
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
)
app.use(express.json())


// ── REST routes ──────────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status: "V-Nav server running 🚀" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/events", eventRoutes);

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Error]", err.message);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ── HTTP + Socket.IO server ──────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});

registerSocketHandlers(io);

// ── MongoDB connection → then start listening ─────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(`✅ MongoDB connected: ${MONGO_URI}`);
    server.listen(PORT, () => {
      console.log(`🚀 V-Nav server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
