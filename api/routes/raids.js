import { Router } from "express";
import { getValkey } from "../cache/valkey.js";

const router = Router();
const LIST_KEY = "raids:last";

/**
 * GET /raids?limit=10
 * Returns the most recent raids written by /ingest/log (RE_RAID).
 * Ingest stores: LPUSH "raids:last" JSON.stringify({ time, raid })
 */
router.get("/", async (req, res) => {
  const kv = await getValkey();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));

  // LRANGE index is inclusive; we store newest at head via LPUSH
  const rawItems = await kv
    .customCommand(["LRANGE", LIST_KEY, "0", String(limit - 1)])
    .catch(() => []);

  const raids = [];
  for (const item of rawItems || []) {
    try {
      // items are stored as JSON strings in ingest
      const obj = typeof item === "string" ? JSON.parse(item) : item;
      // normalize fields
      raids.push({
        raid: obj.raid ?? String(obj?.name ?? "unknown"),
        time: Number(obj.time ?? obj.at ?? Date.now()),
        detail: obj.detail ?? null,
      });
    } catch {
      // if something weird got pushed, keep it visible
      raids.push({ raid: "unknown", time: Date.now(), raw: String(item) });
    }
  }

  res.json({ count: raids.length, raids });
});

export default router;
