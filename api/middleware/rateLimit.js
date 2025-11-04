// /api/middleware/rateLimit.js
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import IORedis from "ioredis";

const redis = new IORedis({
  host: process.env.VALKEY_HOST || "localhost",
  port: Number(process.env.VALKEY_PORT || 6379),
  // password: process.env.VALKEY_PASSWORD,
  enableOfflineQueue: true,
  lazyConnect: false,
  maxRetriesPerRequest: 2,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

// Wait until Valkey is ready (or time out)
const redisReady = new Promise((resolve, reject) => {
  const t = setTimeout(
    () => reject(new Error("Valkey connect timeout")),
    10000
  );
  redis.once("ready", () => {
    clearTimeout(t);
    resolve();
  });
  redis.once("error", (err) => {
    console.error("[rate-limit] Valkey error:", err?.message || err);
  });
});

async function makeRedisStore() {
  try {
    await redisReady;
    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: "rl:",
    });
  } catch {
    console.warn("[rate-limit] Falling back to in-memory store");
    return null;
  }
}

function buildLimiterOptions(base = {}) {
  return {
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    ...base,
  };
}

export async function createLimiter(baseOptions = {}) {
  const store = await makeRedisStore();
  const opts = buildLimiterOptions(baseOptions);
  if (store) opts.store = store;
  return rateLimit(opts);
}

export async function getGlobalLimiter(
  maxGlobalRequests = 300,
  windowMs = 10 * 60 * 1000
) {
  console.log(
    `Creating global rate limiter with: ${maxGlobalRequests} requests per ${
      windowMs / 1000 / 60
    } minutes per IP`
  );
  return createLimiter({
    windowMs,
    max: maxGlobalRequests,
    // IPv6-safe keying
    keyGenerator: (req) => ipKeyGenerator(req),
  });
}

export async function getApiLimiter(
  maxRequests = 100,
  windowMs = 15 * 60 * 1000
) {
  console.log(
    `Creating API rate limiter: ${maxRequests} requests per ${
      windowMs / 1000 / 60
    } minutes per IP+API key`
  );
  return createLimiter({
    windowMs,
    max: maxRequests,
    // Mix API key with IPv6-safe IP to prevent bypass and key sharing abuse
    keyGenerator: (req) => {
      const apiKey =
        req.get("x-api-key") ||
        req.query.api_key ||
        req.body?.api_key ||
        "no-key";
      return `${ipKeyGenerator(req)}:${apiKey}`;
    },
  });
}

export async function getWriteLimiter() {
  return createLimiter({
    windowMs: 15 * 1000,
    max: 10,
    keyGenerator: (req) => `${ipKeyGenerator(req)}:${req.path}`,
  });
}
