// /api/routes/ingest.js
import { Router } from "express";
import { getValkey } from "../cache/valkey.js";

const router = Router();

/* ------------ Patterns ------------ */
// Player/connection
const RE_STEAM_CONN = /Got connection SteamID\s+(\d{17})/i;
const RE_STEAM_HANDSHAKE = /Got handshake from client\s+(\d{17})/i;
const RE_PLAYER_SPAWNED =
  /Got character ZDOID from\s+([^:]+)\s*:\s*([-\d]+)\s*:\s*(\d+)/i;
const RE_CLOSING_SOCKET = /Closing socket\s+(\d{17})/i;
const RE_RPC_DISCONNECT = /\bRPC_Disconnect\b/i;

// Server lifecycle
const RE_UPDATING =
  /(Checking for updates|Update available|Downloading update|Installing update)/i;
const RE_UPDATED =
  /(Updates installed|Update completed|Finished installing update)/i;
const RE_STARTING = /(Begin MonoManager ReloadAssembly)/i;
const RE_ONLINE = /(Opened Steam server)/i;
const RE_SHUTTING =
  /(Shutting down|Stopping server|Quit game|Server stopping)/i;
const RE_OFFLINE = /(Exited cleanly|Server stopped|Valheim server exited)/i;

/* ------------ Constants ------------ */
const STEAM_CANDIDATE_TTL_SEC = 60;
const STEAM_PAIR_WINDOW_MS = 30_000;
const PLAYER_TTL_SEC = 24 * 3600;
const MAX_ONLINE = 10;

async function recordSteamCandidate(kv, steamId, now = Date.now()) {
  await kv.customCommand([
    "ZADD",
    "steam:candidates",
    String(now),
    String(steamId),
  ]);
  const cutoff = String(now - STEAM_CANDIDATE_TTL_SEC * 1000);
  await kv.customCommand([
    "ZREMRANGEBYSCORE",
    "steam:candidates",
    "-inf",
    cutoff,
  ]);
}

async function pairNameWithRecentSteam(kv, playerName, now = Date.now()) {
  const minScore = String(now - STEAM_PAIR_WINDOW_MS);
  const maxScore = String(now);
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
  const sessKey = `player:sess:${playerId}`;
  const hasSession = Number(await kv.customCommand(["EXISTS", sessKey]));
  if (!hasSession) {
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

  await kv.set(
    `player:id:${playerId}`,
    JSON.stringify({ id: playerId, joinedAt: now, ...extra }),
    { ex: PLAYER_TTL_SEC }
  );

  // refresh score if exists, else add new and enforce cap
  await kv.customCommand([
    "ZADD",
    "players:online",
    "XX",
    "CH",
    String(now),
    String(playerId),
  ]);
  const added = await kv.customCommand([
    "ZADD",
    "players:online",
    "NX",
    String(now),
    String(playerId),
  ]);
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

async function setServerStatus(kv, status, detail = "", at = Date.now()) {
  const payload = { status, at, detail };
  await kv.set("server:status", JSON.stringify(payload), { ex: 7 * 24 * 3600 });
  await kv.customCommand([
    "ZADD",
    "server:history",
    String(at),
    JSON.stringify(payload),
  ]);
  return payload;
}

function classifyServer(line) {
  if (RE_UPDATING.test(line)) return "updating";
  if (RE_UPDATED.test(line)) return "updated";
  if (RE_STARTING.test(line)) return "starting";
  if (RE_ONLINE.test(line)) return "online";
  if (RE_SHUTTING.test(line)) return "shutting_down";
  if (RE_OFFLINE.test(line)) return "offline";
  return null;
}

/* ------------ Unified ingest endpoint ------------ */
router.post("/log", async (req, res) => {
  const { line = "", ts } = req.body || {};
  console.log("Ingest log line:", line);
  if (!line || typeof line !== "string") {
    return res.status(400).json({ error: "Missing 'line' string in body" });
  }

  const kv = await getValkey();
  const now = ts ? Date.parse(ts) || Date.now() : Date.now();

  // ---- server status first (cheap, independent) ----
  const status = classifyServer(line);
  if (status) {
    await setServerStatus(kv, status, line, now);
  }

  // ---- player/connection events ----
  let m;

  // candidates
  m = line.match(RE_STEAM_CONN) || line.match(RE_STEAM_HANDSHAKE);
  if (m) {
    await recordSteamCandidate(kv, m[1], now);
    return res.json({
      handled: true,
      kind: "steam-candidate",
      status: status || null,
    });
  }

  // spawned: join vs death (0:0)
  m = line.match(RE_PLAYER_SPAWNED);
  if (m) {
    const name = m[1].trim();
    const a = Number(m[2]);
    const b = Number(m[3]);
    const isDeath = a === 0 && b === 0;

    if (isDeath) {
      const sessKey = `player:sess:${name}`;
      const exists = Number(await kv.customCommand(["EXISTS", sessKey]));
      if (!exists)
        await kv.customCommand([
          "HSET",
          sessKey,
          "start",
          String(now),
          "deaths",
          "0",
        ]);
      const deaths = Number(
        await kv.customCommand(["HINCRBY", sessKey, "deaths", "1"])
      );
      await kv.customCommand(["EXPIRE", sessKey, String(PLAYER_TTL_SEC)]);
      const raw = await kv.get(`player:id:${name}`);
      let obj = raw ? JSON.parse(raw) : { id: name };
      obj.lastDeathAt = now;
      obj.sessionDeaths = deaths;
      await kv.set(`player:id:${name}`, JSON.stringify(obj), {
        ex: PLAYER_TTL_SEC,
      });

      return res.json({
        handled: true,
        kind: "death",
        playerId: name,
        sessionDeaths: deaths,
        status: status || null,
      });
    } else {
      const steamId = await pairNameWithRecentSteam(kv, name, now);
      await markPlayerOnline(kv, name, {
        steamId: steamId || undefined,
        source: "spawned",
      });
      return res.json({
        handled: true,
        kind: "join",
        playerId: name,
        steamId: steamId || null,
        status: status || null,
      });
    }
  }

  // explicit leave
  m = line.match(RE_CLOSING_SOCKET);
  if (m) {
    const steamId = m[1];
    const result = await markPlayerOfflineBySteam(kv, steamId);
    return res.json({
      handled: true,
      kind: "leave",
      steamId,
      ...result,
      status: status || null,
    });
  }

  // fallback leave
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
          kind: "leave-fallback",
          steamId,
          playerId: mapped,
          status: status || null,
        });
      }
    }
    return res.json({
      handled: true,
      kind: "leave-fallback",
      guess: null,
      status: status || null,
    });
  }

  // no player event; maybe only server status changed
  if (status) return res.json({ handled: true, kind: "server", status });

  // ignore noisy line
  return res.status(204).send();
});

export default router;
