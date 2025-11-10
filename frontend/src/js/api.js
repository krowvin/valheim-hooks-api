const API_URL = import.meta.env.VITE_API_URL || "/api";

function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function pickNumber(...vals) {
  for (const v of vals) {
    const n = toNumber(v, NaN);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function normalizeStatus(json) {
  if (!json) return {};
  const name = json.name || json.serverName || "Valheim";
  const current = json.current || null;
  const history = Array.isArray(json.history) ? json.history : [];
  const rawPlayers = Array.isArray(json.players)
    ? json.players
    : Array.isArray(json.raw?.players)
    ? json.raw.players
    : [];
  const max = pickNumber(
    json.maxPlayers,
    json.maxplayers,
    json.raw?.maxplayers
  );

  return {
    serverName: name,
    version: json.version || null,
    maxPlayers: Number.isFinite(max) ? max : null,
    numPlayers:
      pickNumber(json.numPlayers, json.numplayers, rawPlayers.length) || 0,
    players: rawPlayers.map((p, i) => ({
      id: p.id ?? i,
      name: (p.name || "").trim(),
      timeSeconds: toNumber(p.time ?? p.duration, 0),
    })),
    updatedAt: json.updatedAt || Date.now(),
    current,
    history,
  };
}

async function fetchVersion() {
  const res = await fetch(`${API_URL}/version`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchStatus() {
  const res = await fetch(`${API_URL}/server/status`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return normalizeStatus(json);
}

async function fetchOnline() {
  const res = await fetch(`${API_URL}/player/online`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchRaids() {
  const res = await fetch(`${API_URL}/raids?limit=10`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export { fetchVersion, fetchStatus, fetchOnline, fetchRaids };
