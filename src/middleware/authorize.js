import { canAccess, USER_ROLES } from "../auth/roles.js";
import { authenticate } from "./authenticate.js";

/** The core authentication middleware (401s unauthenticated requests, attaches req.user). */
export const requireAuth = authenticate;

function unauthorized(res) {
  return res.status(401).json({ error: { status: 401, message: "Unauthorized" } });
}

function forbidden(res, message) {
  return res.status(403).json({ error: { status: 403, message: message || "Forbidden" } });
}

/**
 * Reusable role-based authorization for protected endpoints.
 *
 * Access levels (hierarchy): user < vendor < admin. A route requiring role R
 * allows users whose role has access >= R:
 * - requireUser:    any authenticated user with a known role (user/vendor/admin)
 * - requireVendor:  vendor or admin
 * - requireAdmin:   admin only
 * - requireRole(r): role with access >= r
 *
 * Rejects with:
 * - 401 Unauthorized — no authenticated user (banned accounts are already
 *   rejected as unauthenticated by `authenticate`).
 * - 403 Forbidden — authenticated but not allowed for this role.
 *
 * `req.user` is attached by `authenticate`; authorization never trusts
 * identity fields from the request body.
 *
 * Usage:
 *   app.use('/api/bookings', authenticate, requireVendor, ...);
 *   app.get('/api/admin/users', requireAdmin, handler);
 */
export function requireRole(requiredRole) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return unauthorized(res);
    if (!canAccess(user.role, requiredRole)) {
      return forbidden(res, `Role "${requiredRole}" is required`);
    }
    return next();
  };
}

export const requireUser = requireRole("user");
export const requireVendor = requireRole("vendor");
export const requireAdmin = requireRole("admin");

/** True when `resource` is owned by the authenticated user. */
export function isOwner(user, resource, { ownerField = "ownerId" } = {}) {
  return Boolean(user?.id) && Boolean(resource) && resource[ownerField] === user.id;
}

/**
 * Resource-ownership middleware.
 *
 * Requires `req[resourceField]` (default `req.resource`) to be set to a
 * resource that the authenticated user owns (403 otherwise). Routes should
 * fetch the resource server-side from the database and pass it along — the
 * resource object must come from a trusted source, never from the request
 * body. Use `isOwner` directly for inline checks.
 */
export function requireOwn(resourceField = "resource", { ownerField = "ownerId" } = {}) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return unauthorized(res);
    const resource = req[resourceField];
    if (!resource) return forbidden(res, "Resource not found");
    if (!isOwner(user, resource, { ownerField })) {
      return forbidden(res, "You do not own this resource");
    }
    return next();
  };
}

export { USER_ROLES };
