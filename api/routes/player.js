import { Router } from "express";
import { getValkey } from "../cache/valkey.js";
import { isPlayerMiddleware } from "../middleware/player.js";
const router = Router();

router.get("/", async (req, res) => {
  const kv = await getValkey();
  const count = await kv.incr("players:visits");
  res.json({ visits: count });
});

router.post("/join", isPlayerMiddleware, async (req, res) => {
  const data = req.body;

  const kv = await getValkey();
  await kv.set(
    `players:id:${data.id}`,
    JSON.stringify({ ...data, joinedAt: Date.now() }),
    {
      ex: 3600 * 24,
    }
  );
  res.send({ message: `Player ${data.id} has joined.` });
});

router.post("/leave", isPlayerMiddleware, async (req, res) => {
  const data = req.body;

  const kv = await getValkey();

  const playerData = await kv.get(`players:id:${req.body.id}`);
  console.log("Player data on leave:", playerData);
  if (!playerData) {
    return res.status(400).send({ error: "Player not found." });
  }
  try {
    await kv.del(`players:id:${data.id}`);
  } catch (err) {
    return res.status(500).send({ error: "Failed to remove player data." });
  }
  res.send({ message: `Player ${data.id} has left.` });
});
router.get("/online", async (req, res) => {
  try {
    const kv = await getValkey();
    const pattern = "players:id:*";
    const count = 200; // tune as needed

    let cursor = "0";
    const keys = [];

    do {
      // SCAN <cursor> MATCH <pattern> COUNT <count>
      const [nextCursor, batch] = await kv.customCommand([
        "SCAN",
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        String(count),
      ]);

      cursor = String(nextCursor || "0");

      // 'batch' is an array of keys (may be empty)
      if (Array.isArray(batch) && batch.length) {
        keys.push(...batch.map(String));
      }
    } while (cursor !== "0");

    // Fetch and parse players
    const players = [];
    for (const key of keys) {
      const data = await kv.get(key);
      if (!data) continue;
      try {
        players.push({ pd: JSON.parse(data), key: key });
      } catch {
        players.push({ id: key.replace("players:", ""), raw: data });
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
