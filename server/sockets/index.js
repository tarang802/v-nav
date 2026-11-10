import { verifySocketToken } from "../middleware/auth.js";
import User from "../models/User.js";

const liveLocations = new Map();

const socketUserMap = new Map();

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = verifySocketToken(token);
      socket.userId = decoded.id;

      const user = await User.findById(decoded.id).select("name friends");
      if (!user) return next(new Error("User not found"));

      socket.userName = user.name;
      socket.friendIds = user.friends.map((f) => f.toString());

      next();
    } catch (err) {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    const userName = socket.userName;

    console.log(`[Socket] Connected: ${userName} (${userId})`);


    socketUserMap.set(socket.id, userId);

    socket.join(`user:${userId}`);

    const friendLocsSnapshot = [];
    for (const fid of socket.friendIds) {
      if (liveLocations.has(fid)) {
        friendLocsSnapshot.push(liveLocations.get(fid));
      }
    }
    if (friendLocsSnapshot.length > 0) {
      socket.emit("friends:snapshot", friendLocsSnapshot);
    }

    for (const fid of socket.friendIds) {
      io.to(`user:${fid}`).emit("notification", {
        type: "friend:joined",
        userId,
        name: userName,
        message: `${userName} is now online`,
      });
    }

    socket.on("loc:update", ({ lat, lng, accuracy, timestamp }) => {
      const Lat = parseFloat(lat);
      const Lng = parseFloat(lng);
      if (!Number.isFinite(Lat) || !Number.isFinite(Lng)) return;
      if (Lat < -90 || Lat > 90 || Lng < -180 || Lng > 180) return;

      const payload = {
        userId,
        name: userName,
        lat: Lat,
        lng: Lng,
        accuracy: Number.isFinite(parseFloat(accuracy))
          ? parseFloat(accuracy)
          : null,
        timestamp: Number.isFinite(Number(timestamp))
          ? Number(timestamp)
          : Date.now(),
      };

      liveLocations.set(userId, payload);

      for (const fid of socket.friendIds) {
        io.to(`user:${fid}`).emit("friend:loc", payload);
      }
    });

    socket.on("join", async () => {
      try {
        const user = await User.findById(userId).select("friends");
        if (!user) return;
        socket.friendIds = user.friends.map((f) => f.toString());

        const snapshot = [];
        for (const fid of socket.friendIds) {
          if (liveLocations.has(fid)) snapshot.push(liveLocations.get(fid));
        }
        socket.emit("friends:snapshot", snapshot);
      } catch (e) {
        console.error("[Socket] join refresh error:", e);
      }
    });

    socket.on("location:stop", () => {
      liveLocations.delete(userId);
      for (const fid of socket.friendIds) {
        io.to(`user:${fid}`).emit("friend:loc:removed", { userId });
      }
    });

  
    socket.on("disconnect", () => {
      console.log(`[Socket] Disconnected: ${userName} (${userId})`);
      socketUserMap.delete(socket.id);
      liveLocations.delete(userId);

  
      for (const fid of socket.friendIds) {
        io.to(`user:${fid}`).emit("friend:loc:removed", { userId });
        io.to(`user:${fid}`).emit("notification", {
          type: "friend:left",
          userId,
          name: userName,
          message: `${userName} went offline`,
        });
      }
    });
  });
}
