function isPlayerMiddleware(req, res, next) {
  // Example middleware logic: log request details
  console.log(`Player route accessed: ${req.method} ${req.originalUrl}`);
  if (req.method === "POST" && !req.body?.id) {
    return res
      .status(400)
      .send({ error: "Player ID is required in the request body." });
  }
  next();
}

export { isPlayerMiddleware };
