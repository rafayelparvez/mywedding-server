import { authAdapter } from "../auth/index.js";
import { requireAdmin } from "../middleware/authorize.js";
import { USER_ROLES } from "../auth/roles.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const SORT_FIELDS = ["createdAt", "email", "name", "id"];

const badRequest = (res, message) => res.status(400).json({ error: { status: 400, message } });
const notFound = (res, message) => res.status(404).json({ error: { status: 404, message } });

/**
 * Admin user management endpoints — every route is protected by
 * `requireAdmin` (server-side role enforcement; see src/middleware/authorize.js).
 *
 * - GET  /api/admin/users                List users (search by name/email, role filter, pagination)
 * - GET  /api/admin/users/:userId        Get user details
 * - POST /api/admin/users/:userId/block  Block a user
 * - POST /api/admin/users/:userId/unblock Unblock a user
 */
export function adminUsersRoutes(app) {
  app.get("/api/admin/users", requireAdmin, async (req, res, next) => {
    const query = req.query;

    // ---- validation ----
    if (query.search !== undefined && typeof query.search !== "string") {
      return badRequest(res, "search must be a string");
    }
    const search = (query.search ?? "").trim();
    if (query.role !== undefined && !USER_ROLES.includes(query.role)) {
      return badRequest(res, `role must be one of: ${USER_ROLES.join(", ")}`);
    }
    const role = query.role ?? undefined;

    let limit = DEFAULT_LIMIT;
    if (query.limit !== undefined) {
      limit = Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return badRequest(res, `limit must be an integer between 1 and ${MAX_LIMIT}`);
      }
    }

    let offset = 0;
    if (query.offset !== undefined) {
      offset = Number(query.offset);
      if (!Number.isInteger(offset) || offset < 0) {
        return badRequest(res, "offset must be a non-negative integer");
      }
    }

    let sortBy = "createdAt";
    if (query.sortBy !== undefined) {
      if (!SORT_FIELDS.includes(query.sortBy)) {
        return badRequest(res, `sortBy must be one of: ${SORT_FIELDS.join(", ")}`);
      }
      sortBy = query.sortBy;
    }

    let sortOrder = "desc";
    if (query.sortOrder !== undefined) {
      if (query.sortOrder !== "asc" && query.sortOrder !== "desc") {
        return badRequest(res, 'sortOrder must be "asc" or "desc"');
      }
      sortOrder = query.sortOrder;
    }

    // ---- where clause (search matches name OR email, case-insensitively) ----
    const where = [];
    if (search) {
      where.push({ field: "name", operator: "contains", mode: "insensitive", value: search, connector: "OR" });
      where.push({ field: "email", operator: "contains", mode: "insensitive", value: search, connector: "OR" });
    }
    if (role) {
      where.push({ field: "role", value: role });
    }

    try {
      const adapter = await authAdapter();
      const users = await adapter.findMany({
        model: "user",
        where,
        limit,
        offset,
        sortBy: { field: sortBy, direction: sortOrder },
      });
      const total = await adapter.count({ model: "user", where });
      res.status(200).json({ users, total });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/admin/users/:userId", requireAdmin, async (req, res, next) => {
    try {
      const adapter = await authAdapter();
      const user = await adapter.findOne({ model: "user", where: [{ field: "id", value: req.params.userId }] });
      if (!user) return notFound(res, "User not found");
      res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  });

  // Block/unblock helper — updates isBlocked via the Better Auth adapter.
  const setBlocked = (blocked) => async (req, res, next) => {
    try {
      const adapter = await authAdapter();
      const where = [{ field: "id", value: req.params.userId }];
      const user = await adapter.findOne({ model: "user", where });
      if (!user) return notFound(res, "User not found");
      await adapter.update({ model: "user", where, update: { isBlocked: blocked } });
      const updated = await adapter.findOne({ model: "user", where });
      res.status(200).json(updated ?? user);
    } catch (err) {
      next(err);
    }
  };

  app.post("/api/admin/users/:userId/block", requireAdmin, setBlocked(true));
  app.post("/api/admin/users/:userId/unblock", requireAdmin, setBlocked(false));
}
