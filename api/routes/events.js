// /api/routes/events.js
import { Router } from "express";
import { getValkey } from "../cache/valkey.js";

const router = Router();

/**
 * Patterns (single log line per POST)
 */
const RE_STEAM_CONN = /Got connection SteamID\s+(\d{17})/i;
const RE_STEAM_HANDSHAKE = /Got handshake from client\s+(\d{17})/i;
const RE_PLAYER_SPAWNED =
  /Got character ZDOID from\s+([^:]+)\s*:\s*([-\d]+)\s*:\s*(\d+)/i;
const RE_CLOSING_SOCKET = /Closing socket\s+(\d{17})/i;
const RE_RPC_DISCONNECT = /\bRPC_Disconnect\b/i;

const STEAM_CANDIDATE_TTL_SEC = 60;
const STEAM_PAIR_WINDOW_MS = 30_000;
const PLAYER_TTL_SEC = 24 * 3600;
const MAX_ONLINE = 10;

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

async function markPlayerOnline(kv, playerId, extra = {}) {
  const now = Date.now();

  // Session tracking: create session hash if missing
  const sessKey = `player:sess:${playerId}`;
  const hasSession = await kv.customCommand(["EXISTS", sessKey]);
  if (!Number(hasSession)) {
    await kv.customCommand([
      "HSET",
      sessKey,
      "start",
      String(now),
      "deaths",
      "0",
    ]);
  }
  await kv.customCommand(["EXPIRE", sessKey, String(PLAYER_TTL_SEC)]);

  // Upsert player record
  await kv.set(
    `player:id:${playerId}`,
    JSON.stringify({ id: playerId, joinedAt: now, ...extra }),
    { ex: PLAYER_TTL_SEC }
  );

  // Add to online zset; if already present, just refresh score to 'now'
  await kv.customCommand([
    "ZADD",
    "players:online",
    "XX",
    "CH",
    String(now),
    String(playerId),
  ]);
  // If not present, add it
  const added = await kv.customCommand([
    "ZADD",
    "players:online",
    "NX",
    String(now),
    String(playerId),
  ]);
  // Cap at MAX_ONLINE only if this was a new add
  if (Number(added) > 0) {
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
        await kv.del(`player:sess:${id}`);
      }
    }
  }
}

async function markPlayerOfflineById(kv, playerId) {
  await kv.customCommand(["ZREM", "players:online", String(playerId)]);
  await kv.del(`player:id:${playerId}`);
  await kv.del(`player:sess:${playerId}`);
}

async function markPlayerOfflineBySteam(kv, steamId) {
  const playerId = await kv.get(`steam:to-player:${steamId}`);
  if (!playerId) return { ok: false, reason: "no-map" };
  await markPlayerOfflineById(kv, playerId);
  return { ok: true, playerId };
}

/**
 * POST /events/log
 * Body: { line: string, ts?: string }
 */
router.post("/log", async (req, res) => {
  const { line = "", ts } = req.body || {};
  if (!line || typeof line !== "string") {
    return res.status(400).json({ error: "Missing 'line' string in body" });
  }

  const kv = await getValkey();
  const now = ts ? Date.parse(ts) || Date.now() : Date.now();

  // 1) Steam ID candidates
  let m = line.match(RE_STEAM_CONN) || line.match(RE_STEAM_HANDSHAKE);
  if (m) {
    const steamId = m[1];
    await recordSteamCandidate(kv, steamId, now);
    return res.json({ handled: true, type: "steam-candidate", steamId });
  }

  // 2) Spawned: join vs death
  m = line.match(RE_PLAYER_SPAWNED);
  if (m) {
    const playerName = m[1].trim();
    const a = Number(m[2]); // owner part
    const b = Number(m[3]); // zdo id
    const isDeath = a === 0 && b === 0;

    if (isDeath) {
      // Increment deaths for the current session
      const sessKey = `player:sess:${playerName}`;
      const exists = Number(await kv.customCommand(["EXISTS", sessKey]));
      if (!exists) {
        // If we somehow saw a death with no session, create a session now so the death is counted.
        await kv.customCommand([
          "HSET",
          sessKey,
          "start",
          String(now),
          "deaths",
          "0",
        ]);
      }
      const deaths = Number(
        await kv.customCommand(["HINCRBY", sessKey, "deaths", "1"])
      );
      await kv.customCommand(["EXPIRE", sessKey, String(PLAYER_TTL_SEC)]);
      // Optionally reflect in player:id record
      const raw = await kv.get(`player:id:${playerName}`);
      let obj = raw ? JSON.parse(raw) : { id: playerName };
      obj.lastDeathAt = now;
      obj.sessionDeaths = deaths;
      await kv.set(`player:id:${playerName}`, JSON.stringify(obj), {
        ex: PLAYER_TTL_SEC,
      });

      return res.json({
        handled: true,
        type: "death",
        playerId: playerName,
        sessionDeaths: deaths,
      });
    } else {
      // Treat as (re)spawn/join; pair steam if possible; mark online
      const steamId = await pairNameWithRecentSteam(kv, playerName, now);
      await markPlayerOnline(kv, playerName, {
        steamId: steamId || undefined,
        source: "spawned",
      });
      return res.json({
        handled: true,
        type: "join",
        playerId: playerName,
        steamId: steamId || null,
      });
    }
  }

  // Explicit close socket → leave
  m = line.match(RE_CLOSING_SOCKET);
  if (m) {
    const steamId = m[1];
    const result = await markPlayerOfflineBySteam(kv, steamId);
    return res.json({ handled: true, type: "leave", steamId, ...result });
  }

  // RPC disconnect fallback
  if (RE_RPC_DISCONNECT.test(line)) {
    const latest = await kv.customCommand([
      "ZREVRANGE",
      "steam:candidates",
      "0",
      "0",
    ]);
    if (Array.isArray(latest) && latest.length >= 1) {
      const steamId = String(latest[0]);
      const mapped = await kv.get(`steam:to-player:${steamId}`);
      if (mapped) {
        await markPlayerOfflineById(kv, mapped);
        return res.json({
          handled: true,
          type: "leave-fallback",
          steamId,
          playerId: mapped,
        });
      }
    }
    return res.json({ handled: true, type: "leave-fallback", guess: null });
  }

  return res.json({ handled: false, type: "ignored" });
});

export default router;
