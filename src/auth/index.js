import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mongodbAdapter } from "@better-auth/mongo-adapter";

import { client, db } from "../config/db.js";
import { env } from "../config/env.js";
import { DEFAULT_USER_ROLE } from "./roles.js";

// Server-side Better Auth instance used to VERIFY tokens issued by the
// Next.js app's Better Auth (same secret + same MongoDB database, so it
// verifies with the same signing keys). The frontend owns authentication
// issuance — this instance never issues passwords, logins or sessions itself.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: false },
  database: mongodbAdapter(db, { client }),
  plugins: [jwt()],
  // `banned` is Better Auth's "blocked" flag (admin plugin). Declared as
  // read-only here: nothing on the server can set it via Better Auth APIs —
  // only direct DB changes can mark an account blocked.
  user: {
    additionalFields: {
      // Business fields from the MyWedding schema (SERVER_AUDIT.md §13).
      // Better Auth core user fields: name, email, image.
      isBlocked: {
        type: "boolean",
        required: false,
        input: false,
      },
      businessName: { type: "string", required: false },
      subscriptionPlan: { type: "string", required: false },
      subscriptionExpiresAt: { type: "date", required: false },
      // Mirrors the frontend's Better Auth user schema
      // (mywedding/src/lib/auth.ts): user/vendor/admin with default "user".
      // Read-only here so nothing on the server can change roles.
      role: {
        type: "string",
        required: false,
        defaultValue: DEFAULT_USER_ROLE,
        input: false,
      },
    },
  },
});

// The resolved Better Auth adapter (the instance exposes it on $context).
export async function authAdapter() {
  return (await auth.$context).adapter;
}
