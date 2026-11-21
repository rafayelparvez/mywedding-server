import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const NODE_ENV = (process.env.NODE_ENV || "development").trim() || "development";
const isProduction = NODE_ENV === "production";

const PORT = Number(process.env.PORT || 8000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${JSON.stringify(process.env.PORT)}`);
}

const MONGODB_URI = required("MONGODB_URI");

// Better Auth — server-side verification of the Next.js app's tokens.
// MUST match the Next.js app's BETTER_AUTH_SECRET (mywedding/.env) so the
// server verifies frontend tokens with the same signing keys.
const BETTER_AUTH_SECRET = required("BETTER_AUTH_SECRET");
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

// CORS is always pinned to the configured CLIENT_URL (see src/app.js). The cors
// package only sends "*" when told to, and with credentials: true it must never
// be "*" — in production the origin is required, so misconfiguration fails fast.
const CLIENT_URL = isProduction
  ? required("CLIENT_URL")
  : process.env.CLIENT_URL || "http://localhost:3000";

export const env = {
  NODE_ENV,
  isProduction,
  PORT,
  MONGODB_URI,
  CLIENT_URL,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
};
