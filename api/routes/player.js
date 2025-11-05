import { Router } from "express";
import { getValkey } from "../cache/valkey.js";
import { SERVER_MAX_PLAYERS } from "../index.js";

const router = Router();

router.get("/", async (req, res) => {
  const kv = await getValkey();
  const count = await kv.incr("players:visits");
  res.json({ visits: count });
});

router.get("/online", async (req, res) => {
  try {
    const kv = await getValkey();

    // Use the index set instead of SCAN for speed
    const ids = await kv.customCommand(["ZRANGE", "players:online", "0", "-1"]);

    const players = [];
    for (const id of ids) {
      const raw = await kv.get(`player:id:${id}`);
      if (!raw) {
        // Clean up stale index entries where the key expired
        await kv.customCommand(["ZREM", "players:online", String(id)]);
        continue;
      }
      try {
        players.push(JSON.parse(raw));
      } catch {
        players.push({ id: String(id), raw });
      }
    }

    res.json({ count: players.length, maxCount: SERVER_MAX_PLAYERS, players });
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).json({ error: "Failed to fetch online players" });
  }
});

router.get("/status", (req, res) => {
  res.send("Player route is up and running!");
});

export default router;
