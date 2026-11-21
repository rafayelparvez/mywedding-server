import { auth, authAdapter } from "../auth/index.js";
import { env } from "../config/env.js";

/** Extracts the bearer token from the Authorization header, or null. */
function extractToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function unauthorized(res, message) {
  return res.status(401).json({ error: { status: 401, message: message || "Unauthorized" } });
}

/**
 * Authenticates the request with a Better Auth JWT.
 *
 * Token verification is delegated to Better Auth's own mechanism
 * (`auth.api.verifyJWT` from the jwt plugin): the signature is checked
 * cryptographically against the Better Auth JWKS public keys, and issuer,
 * audience and expiration are verified by Better Auth (jose `jwtVerify`).
 * Invalid or expired tokens are rejected.
 *
 * On success the current user is loaded from the database and attached as
 * `req.user`. Identity comes only from the verified token and the database —
 * never from the request body.
 *
 * Rejects with 401 when:
 * - no bearer token is present,
 * - the token is missing, invalid or expired,
 * - the user is not found in the database, or
 * - the user is blocked.
 */
export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized(res);

    const { payload } = (await auth.api.verifyJWT({ body: { token, issuer: env.BETTER_AUTH_URL } })) ?? {};
    if (!payload?.sub) return unauthorized(res);

    // Load the current user from the database.
    const adapter = await authAdapter();
    const user = await adapter.findOne({ model: "user", where: [{ field: "id", value: payload.sub }] });
    if (!user) return unauthorized(res);
    if (user.banned === true) return unauthorized(res, "User account is blocked");

    req.user = user;
    return next();
  } catch (err) {
    console.error("[auth] authentication failed:", err);
    return unauthorized(res);
  }
}
