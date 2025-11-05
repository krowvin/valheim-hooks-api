import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { getValkey } from "./cache/valkey.js";

// routes
import playerRoutes from "./routes/player.js";
import eventsRoute from "./routes/events.js";
import serverRoute from "./routes/server.js";

// authentication
import { ensureApiKey } from "./utils/apiKey.js";

// middleware
import { getGlobalLimiter, getApiLimiter } from "./middleware/rateLimit.js";
import { requireApiKey } from "./middleware/auth.js";

// Read env var for max players, default to 10
const SERVER_MAX_PLAYERS = Number(process.env.SERVER_MAX_PLAYERS || 10);
const SERVER_NAME = process.env.VALHEIM_SERVER_NAME || "Valheim Server";

// Generate/load API key and log it each start
const rootDir = process.cwd();
ensureApiKey(rootDir);

const app = express();
const port = 3000;

// API Hardening
app.set("trust proxy", 1); // honor X-Forwarded-* when behind a proxy
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

const [globalLimiter, apiLimiter] = await Promise.all([
  getGlobalLimiter(),
  getApiLimiter(),
]);
app.use(globalLimiter);
// TODO: Handle errors
// TODO: Handle headers

// ensure Valkey is ready before serving traffic
const ready = (async () => {
  const kv = await getValkey();
  await kv.set("healthcheck", "ok", { px: 5_000 });
})();

app.get("/", async (req, res) => {
  await ready;
  res.json({ status: "ok" });
});

app.use("/player", apiLimiter, playerRoutes);
app.use("/server", apiLimiter, serverRoute);
app.use("/events", requireApiKey, apiLimiter, eventsRoute);

app.listen(port, () => {
  console.log(`READY! API listening on :${port}`);
});

export { SERVER_MAX_PLAYERS, SERVER_NAME };
