import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mongodbAdapter } from "@better-auth/mongo-adapter";

import { client, db } from "../config/db.js";
import { env } from "../config/env.js";

const adapter = mongodbAdapter(db, { client });

// Server-side Better Auth instance used to VERIFY tokens issued by the
// Next.js app's Better Auth (same secret + same MongoDB database, so it
// verifies with the same signing keys). The frontend owns authentication
// issuance — this instance never issues passwords, logins or sessions itself.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: false },
  database: adapter,
  plugins: [jwt()],
});

export { adapter };
