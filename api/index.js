import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { getValkey } from "./cache/valkey.js";

// routes
import playerRoutes from "./routes/player.js";

// authentication
import { ensureApiKey } from "./utils/apiKey.js";

// middleware
import { getGlobalLimiter, getApiLimiter } from "./middleware/rateLimit.js";

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

app.listen(port, () => {
  console.log(`READY! API listening on :${port}`);
});
