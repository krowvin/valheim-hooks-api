import { Router } from "express";
import { getValkey } from "../cache/valkey.js";
import { SERVER_NAME } from "../index.js";

const router = Router();

/**
 * GET /server/status
 * Returns the last known status and a short recent history.
 */
router.get("/status", async (_req, res) => {
  const kv = await getValkey();
  const raw = await kv.get("server:status");
  let current = null;
  try {
    current = raw ? JSON.parse(raw) : null;
  } catch {
    current = raw ? { status: String(raw), at: Date.now() } : null;
  }

  // last 20 events
  const history = await kv.customCommand([
    "ZREVRANGE",
    "server:history",
    "0",
    "19",
  ]);

  const parsedHistory = [];
  for (const h of history) {
    try {
      parsedHistory.push(JSON.parse(h));
    } catch {
      parsedHistory.push({ status: "unknown", at: Date.now(), detail: h });
    }
  }

  res.json({ name: SERVER_NAME, current, history: parsedHistory });
});

export default router;
