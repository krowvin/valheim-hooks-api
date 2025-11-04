// /api/routes/server.js
import { Router } from "express";
import { getValkey } from "../cache/valkey.js";

/**
 * Parse server lifecycle from Valheim logs posted via Docker log hooks.
 * Expected body: { line: string, ts?: string }
 */

const RE_UPDATING =
  /(Checking for updates|Update available|Downloading update|Installing update)/i;
const RE_UPDATED =
  /(Updates installed|Update completed|Finished installing update)/i;
const RE_STARTING =
  /(Starting server|Bootstrapping|Launching Valheim server|Server starting)/i;
const RE_ONLINE =
  /(Connected\b|Game server connected|Game server listening|Server: New peer connected)/i;
const RE_SHUTTING_DOWN =
  /(Shutting down|Stopping server|Quit game|Server stopping)/i;
const RE_OFFLINE = /(Exited cleanly|Server stopped|Valheim server exited)/i;

const STATUS = {
  UPDATING: "updating",
  STARTING: "starting",
  ONLINE: "online",
  SHUTTING_DOWN: "shutting_down",
  OFFLINE: "offline",
  UPDATED: "updated",
};

const router = Router();

async function setStatus(kv, status, detail = "", at = Date.now()) {
  const payload = { status, at, detail };
  await kv.set("server:status", JSON.stringify(payload), { ex: 7 * 24 * 3600 });
  await kv.set("server:status:text", status, { ex: 7 * 24 * 3600 });
  await kv.customCommand([
    "ZADD",
    "server:history",
    String(at),
    JSON.stringify(payload),
  ]);
  return payload;
}

function classify(line) {
  if (RE_UPDATING.test(line)) return STATUS.UPDATING;
  if (RE_UPDATED.test(line)) return STATUS.UPDATED;
  if (RE_STARTING.test(line)) return STATUS.STARTING;
  if (RE_ONLINE.test(line)) return STATUS.ONLINE;
  if (RE_SHUTTING_DOWN.test(line)) return STATUS.SHUTTING_DOWN;
  if (RE_OFFLINE.test(line)) return STATUS.OFFLINE;
  return null;
}

/**
 * POST /server/log
 * Body: { line: string, ts?: string }
 * Use x-api-key header for auth (middleware applied in index.js).
 */
router.post("/log", async (req, res) => {
  const { line = "", ts } = req.body || {};
  if (!line || typeof line !== "string") {
    return res.status(400).json({ error: "Missing 'line' string in body" });
  }

  const kv = await getValkey();
  const when = ts ? Date.parse(ts) || Date.now() : Date.now();

  const status = classify(line);

  if (!status) {
    // keep a small rolling buffer of unclassified lines for debugging
    await kv.customCommand([
      "LPUSH",
      "server:unclassified",
      JSON.stringify({ at: when, line }),
    ]);
    await kv.customCommand(["LTRIM", "server:unclassified", "0", "199"]);
    return res.json({ handled: false, type: "ignored" });
  }

  const payload = await setStatus(kv, status, line, when);
  return res.json({ handled: true, ...payload });
});

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

  res.json({ current, history: parsedHistory });
});

export default router;
