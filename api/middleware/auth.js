export function requireApiKey(req, res, next) {
  const provided =
    req.get("x-api-key") || req.query.api_key || req.body?.api_key;
  const expected = process.env.API_KEY;

  if (!expected) {
    console.error("\x1b[31m[AUTH] Missing API_KEY in environment!\x1b[0m");
    return res.status(500).json({
      error: "Server misconfiguration: API_KEY not initialized.",
    });
  }

  if (provided && provided === expected) {
    return next();
  }

  console.warn(
    `\x1b[31m[AUTH] Invalid or missing API_KEY from ${req.ip} : ${req.originalUrl}\x1b[0m`
  );
  return res.status(401).json({ error: "Unauthorized" });
}
