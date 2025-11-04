import { Router } from "express";
import { getValkey } from "../cache/valkey.js";

/**
 * Patterns we care about (single log line per POST)
 */
const RE_STEAM_CONN = /Got connection SteamID\s+(\d{17})/i;
const RE_STEAM_HANDSHAKE = /Got handshake from client\s+(\d{17})/i;
const RE_PLAYER_SPAWNED = /Got character ZDOID from\s+([^:]+)\s*:/i; // captures name
const RE_CLOSING_SOCKET = /Closing socket\s+(\d{17})/i;
const RE_RPC_DISCONNECT = /\bRPC_Disconnect\b/i;

// windows used to correlate steamid to a name
const STEAM_CANDIDATE_TTL_SEC = 60; // track steamids seen recently
const STEAM_PAIR_WINDOW_MS = 30 * 1000; // pairing window for Spawned
const PLAYER_TTL_SEC = 24 * 3600; // how long a player record sticks around
const MAX_ONLINE = 10;

const router = Router();

/**
 * Utility: add/update a player as online + evict oldest extras
 */
async function markPlayerOnline(kv, playerId, extra = {}) {
  const now = Date.now();

  // upsert player record
  await kv.set(
    `player:id:${playerId}`,
    JSON.stringify({ id: playerId, joinedAt: now, ...extra }),
    { ex: PLAYER_TTL_SEC }
  );

  // add to zset ordered by join time
  await kv.customCommand([
    "ZADD",
    "players:online",
    String(now),
    String(playerId),
  ]);

  // enforce cap
  const size = Number(await kv.customCommand(["ZCARD", "players:online"]));
  if (size > MAX_ONLINE) {
    const overflow = size - MAX_ONLINE;

    const oldest = await kv.customCommand([
      "ZRANGE",
      "players:online",
      "0",
      String(overflow - 1),
    ]);

    await kv.customCommand([
      "ZREMRANGEBYRANK",
      "players:online",
      "0",
      String(overflow - 1),
    ]);

    for (const id of oldest) {
      await kv.del(`player:id:${id}`);
      await kv.del(`player:by-steam:${id}`); // if we ever used playerId as steam then it is safe to delete
    }
  }
}

/**
 * Utility: remove a player by playerId
 */
async function markPlayerOfflineById(kv, playerId) {
  await kv.customCommand(["ZREM", "players:online", String(playerId)]);
  await kv.del(`player:id:${playerId}`);
}

/**
 * Utility: remove a player by steamId using mapping
 */
async function markPlayerOfflineBySteam(kv, steamId) {
  const playerId = await kv.get(`steam:to-player:${steamId}`);
  if (!playerId) return { ok: false, reason: "no-map" };
  await markPlayerOfflineById(kv, playerId);
  return { ok: true, playerId };
}

/**
 * Heuristic: remember recent steam IDs (from connection/handshake) and
 * pair the most recent with the next Spawned line (within STEAM_PAIR_WINDOW_MS).
 */
async function recordSteamCandidate(kv, steamId, now = Date.now()) {
  // zset score = ms timestamp
  await kv.customCommand([
    "ZADD",
    "steam:candidates",
    String(now),
    String(steamId),
  ]);
  // trim old candidates beyond TTL
  const cutoff = String(now - STEAM_CANDIDATE_TTL_SEC * 1000);
  await kv.customCommand([
    "ZREMRANGEBYSCORE",
    "steam:candidates",
    "-inf",
    cutoff,
  ]);
}

/**
 * On seeing a Spawned line with a name, associate with most recent steam candidate
 */
async function pairNameWithRecentSteam(kv, playerName, now = Date.now()) {
  const minScore = String(now - STEAM_PAIR_WINDOW_MS);
  const maxScore = String(now);

  // get most recent candidate in window
  const candidates = await kv.customCommand([
    "ZREVRANGEBYSCORE",
    "steam:candidates",
    maxScore,
    minScore,
    "LIMIT",
    "0",
    "1",
  ]);

  if (Array.isArray(candidates) && candidates.length > 0) {
    const steamId = String(candidates[0]);
    // map both ways
    await kv.set(`steam:to-player:${steamId}`, playerName, {
      ex: PLAYER_TTL_SEC,
    });
    await kv.set(`player:to-steam:${playerName}`, steamId, {
      ex: PLAYER_TTL_SEC,
    });
    return steamId;
  }
  return null;
}

/**
 * POST /events/log
 * Body: { line: string, ts?: string }
 * Send x-api-key header when calling from your Valheim server
 */
router.post("/log", async (req, res) => {
  const { line = "", ts } = req.body || {};
  if (!line || typeof line !== "string") {
    return res.status(400).json({ error: "Missing 'line' string in body" });
  }

  const kv = await getValkey();
  const now = Date.now();

  // capture steam candidates early
  let m = line.match(RE_STEAM_CONN) || line.match(RE_STEAM_HANDSHAKE);
  if (m) {
    const steamId = m[1];
    await recordSteamCandidate(kv, steamId, now);
    return res.json({ handled: true, type: "steam-candidate", steamId, ts });
  }

  // player spawned (join)
  m = line.match(RE_PLAYER_SPAWNED);
  if (m) {
    const rawName = m[1].trim();
    const playerId = rawName; // you can normalize if you want
    const steamId = await pairNameWithRecentSteam(kv, playerId, now);

    await markPlayerOnline(kv, playerId, {
      steamId: steamId || undefined,
      source: "spawned",
    });
    return res.json({
      handled: true,
      type: "join",
      playerId,
      steamId: steamId || null,
      ts,
    });
  }

  // disconnect via closing socket (best: has steam id)
  m = line.match(RE_CLOSING_SOCKET);
  if (m) {
    const steamId = m[1];
    const result = await markPlayerOfflineBySteam(kv, steamId);
    return res.json({ handled: true, type: "leave", steamId, ...result, ts });
  }

  // RPC_Disconnect fallback (we may not know which player)
  if (RE_RPC_DISCONNECT.test(line)) {
    // Attempt a guess: use most recent candidate and mapped player (likely just disconnected)
    const latest = await kv.customCommand([
      "ZREVRANGE",
      "steam:candidates",
      "0",
      "0",
      "WITHSCORES",
    ]);
    let guess = null;
    if (Array.isArray(latest) && latest.length >= 1) {
      const steamId = String(latest[0]);
      const mapped = await kv.get(`steam:to-player:${steamId}`);
      if (mapped) {
        await markPlayerOfflineById(kv, mapped);
        guess = { steamId, playerId: mapped };
      }
    }
    return res.json({ handled: true, type: "leave-fallback", guess, ts });
  }

  // default: ignore line
  return res.json({ handled: false, type: "ignored", ts });
});

export default router;
