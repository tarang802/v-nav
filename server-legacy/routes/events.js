import { Router } from "express";
import Event from "../models/Event.js";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);


router.post("/", async (req, res) => {
  try {
    const { name, description, lat, lng } = req.body;

    if (!name || lat === undefined || lng === undefined) {
      return res
        .status(400)
        .json({ error: "name, lat, and lng are required" });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const event = await Event.create({
      createdBy: req.user._id,
      name: name.trim(),
      description: description ? description.trim() : "",
      location: { lat: parsedLat, lng: parsedLng },
      visibility: "friends",
    });

    await event.populate("createdBy", "name studentId");

    res.status(201).json({ event });
  } catch (err) {
    console.error("Create event error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/friends", async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("friends");
    const visibleCreators = [req.user._id, ...user.friends];

    const events = await Event.find({
      createdBy: { $in: visibleCreators },
      visibility: "friends",
    })
      .populate("createdBy", "name studentId")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ events });
  } catch (err) {
    console.error("Get events error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (!event.createdBy.equals(req.user._id)) {
      return res.status(403).json({ error: "Not your event" });
    }

    await event.deleteOne();
    res.json({ message: "Event deleted" });
  } catch (err) {
    console.error("Delete event error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
