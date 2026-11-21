import { createApp } from "./src/app.js";
import { close, connect } from "./src/config/db.js";
import { env } from "./src/config/env.js";

const app = createApp();

let server;

async function shutdown(signal) {
  console.log(`Received ${signal} - shutting down gracefully...`);
  if (server) {
    server.close(); // Stop accepting new connections; wait for in-flight requests.
  }
  await close();
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

try {
  await connect(); // Fail fast if the database is unreachable.
  server = app.listen(env.PORT, () => {
    console.log(`My Wedding running on port ${env.PORT}`);
  });
} catch (err) {
  console.error("Failed to start the server:", err);
  await close().catch(() => {});
  process.exit(1);
}
