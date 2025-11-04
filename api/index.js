import express from "express";
import cors from "cors";
import { getValkey } from "./cache/valkey.js";

// routes
import playerRoutes from "./routes/player.js";

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// TODO: Handle errors
// TODO: Handle headers
// TODO: Handle

// ensure Valkey is ready before serving traffic
const ready = (async () => {
  const kv = await getValkey();
  await kv.set("healthcheck", "ok", { px: 5_000 });
})();

app.get("/", async (req, res) => {
  await ready;
  res.json({ status: "ok" });
});

app.use("/player", playerRoutes);

// example route that uses Valkey
app.get("/cache/foo", async (req, res) => {
  await ready;
  const kv = await getValkey();
  await kv.set("foo", "bar");
  const v = await kv.get("foo");
  res.json({ foo: v });
});

app.listen(port, () => {
  console.log(`READY! API listening on :${port}`);
});
