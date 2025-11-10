import { Router } from "express";
const router = Router();

router.get("/", (req, res) => {
  res.json({
    version: process.env.BUILD_VERSION || "0.0.0",
    sha: process.env.BUILD_SHA || "",
    shortSha: process.env.BUILD_SHORT_SHA || "",
    builtAt: process.env.BUILD_TIME || "",
    service: process.env.VALHEIM_SERVER_NAME || "Valheim API",
  });
});

export default router;
