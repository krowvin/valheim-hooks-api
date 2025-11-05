import crypto from "crypto";

// Ensure an API_KEY exists in process.env, generating one if missing
// Used for simple API authentication through Valheim Log Hooks
export function ensureApiKey() {
  let apiKey = process.env.API_KEY;

  if (!apiKey) {
    apiKey = crypto.randomBytes(32).toString("base64url");
    process.env.API_KEY = apiKey;

    console.log(
      `\x1b[33m[API] Generated new API_KEY:\t'${apiKey}'
      \n\t\x1b[33mStore this value securely if you need to reuse it.\n\t\x1b[33mYou can also set your own generated API_KEY in the environment to persist it.\x1b[0m`
    );
    console.log("");
  } else {
    console.log(
      `\x1b[33m[API] Using existing API_KEY ending in: ${
        apiKey.slice(0, -6).replace(/./g, "*") + apiKey.slice(-6)
      }\x1b[0m`
    );
  }

  return apiKey;
}

export function requireApiKey(req, res, next) {
  const provided =
    req.get("x-api-key") || req.query.api_key || req.body?.api_key;
  if (provided && provided === process.env.API_KEY) return next();
  return res.status(401).json({ error: "Unauthorized: invalid API key" });
}
