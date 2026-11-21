// Server-local copy of the role model shared with the Next.js app.
// The frontend keeps its own copy at mywedding/src/lib/roles.ts; Better Auth
// stores the role on the user via a read-only additionalField (see
// mywedding/src/lib/auth.ts).

/** Roles, in ascending access level. */
export const USER_ROLES = ["user", "vendor", "admin"];

/** Access level per role. Higher = more access. */
export const ROLE_HIERARCHY = { user: 1, vendor: 2, admin: 3 };

/** Default role for new accounts (mirrors the frontend). */
export const DEFAULT_USER_ROLE = "user";

/** Roles the public registration form may create (mirrors the frontend). */
export const REGISTRATION_ROLES = ["user", "vendor"];

export function isRegistrationRole(value) {
  return value === "user" || value === "vendor";
}

/** Access level of a role; unknown/missing roles get level 0 (no access). */
export function roleLevel(role) {
  return typeof role === "string" ? ROLE_HIERARCHY[role] ?? 0 : 0;
}

/** True when the user's role can access the required role's resources. */
export function canAccess(userRole, requiredRole) {
  const requiredLevel = ROLE_HIERARCHY[requiredRole];
  return requiredLevel !== undefined && roleLevel(userRole) >= requiredLevel;
}
