import { Router } from "express";
import { getValkey } from "../cache/valkey.js";
import { isPlayerMiddleware } from "../middleware/player.js";
import { requireApiKey } from "../middleware/auth.js";

// Read env var for max players, default to 10
const SERVER_MAX_PLAYERS = Number(process.env.SERVER_MAX_PLAYERS || 10);

const router = Router();

router.get("/", async (req, res) => {
  const kv = await getValkey();
  const count = await kv.incr("players:visits");
  res.json({ visits: count });
});

router.post("/join", requireApiKey, isPlayerMiddleware, async (req, res) => {
  const data = req.body;
  const kv = await getValkey();
  const now = Date.now();

  // Upsert player data (24h TTL) under key: player:id:<id>
  await kv.set(
    `player:id:${data.id}`,
    JSON.stringify({ ...data, joinedAt: now }),
    { ex: 3600 * 24 }
  );

  // Track online set by join time (sorted set: players:online)
  await kv.customCommand([
    "ZADD",
    "players:online",
    String(now),
    String(data.id),
  ]);

  // Enforce max online: evict oldest extras (not including the new one since it has the newest score)
  const size = Number(await kv.customCommand(["ZCARD", "players:online"]));
  if (size > SERVER_MAX_PLAYERS) {
    const overflow = size - SERVER_MAX_PLAYERS;

    // Oldest 'overflow' ids
    const oldest = await kv.customCommand([
      "ZRANGE",
      "players:online",
      "0",
      String(overflow - 1),
    ]);

    // Remove them from the online set
    await kv.customCommand([
      "ZREMRANGEBYRANK",
      "players:online",
      "0",
      String(overflow - 1),
    ]);

    // Delete their player keys
    for (const id of oldest) {
      await kv.del(`player:id:${id}`);
      console.log(`Evicted player id ${id} due to max online limit.`);
    }
  }

  res.send({ message: `Player ${data.id} has joined.` });
});

router.post("/leave", requireApiKey, isPlayerMiddleware, async (req, res) => {
  const { id } = req.body;
  const kv = await getValkey();

  const playerKey = `player:id:${id}`;
  const playerData = await kv.get(playerKey);
  if (!playerData) {
    return res.status(400).send({ error: "Player not found." });
  }

  try {
    // Remove from zset and delete the player key
    await kv.customCommand(["ZREM", "players:online", String(id)]);
    await kv.del(playerKey);
  } catch (err) {
    return res.status(500).send({ error: "Failed to remove player data." });
  }

  res.send({ message: `Player ${id} has left.` });
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

    res.json({ count: players.length, players });
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).json({ error: "Failed to fetch online players" });
  }
});

router.get("/status", (req, res) => {
  res.send("Player route is up and running!");
});

export default router;
