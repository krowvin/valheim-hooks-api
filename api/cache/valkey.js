// Via: https://github.com/valkey-io/valkey-glide/blob/main/node/README.md
import { GlideClient } from "@valkey/valkey-glide";

const host = process.env.VALKEY_HOST || "localhost";
const port = Number(process.env.VALKEY_PORT || 6379);
// const password = process.env.VALKEY_PASSWORD; // for auth

let client;

export async function getValkey() {
  if (client) return client;

  const addresses = [{ host, port }];

  client = await GlideClient.createClient({
    addresses,
    // password,
    requestTimeout: 500,
    clientName: "valheim-hooks-api",
    // useTLS: true,
  });

  // quick sanity check
  try {
    const pong = await client.customCommand(["PING"]);
    console.log("Valkey ping:", pong);
  } catch (e) {
    console.error("Valkey ping failed:", e);
    throw e;
  }

  return client;
}
