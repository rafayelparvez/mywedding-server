import { services } from "../db/collections.js";
import { requireAdmin } from "../middleware/authorize.js";
import {
  SERVICE_STATUSES,
  activeServiceCount,
  badRequest,
  findServiceById,
  forbidden,
  getUserById,
  isNonEmptyString,
  isPremiumVendor,
  notFound,
} from "../utils/services.js";

const SORT_FIELDS = ["price", "createdAt"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAdminOptions(query) {
  if (query.search !== undefined && typeof query.search !== "string") return { error: "search must be a string" };
  if (query.category !== undefined && !isNonEmptyString(query.category)) return { error: "category must be a non-empty string" };
  if (query.location !== undefined && !isNonEmptyString(query.location)) return { error: "location must be a non-empty string" };
  if (query.status !== undefined && !SERVICE_STATUSES.includes(query.status)) {
    return { error: `status must be one of: ${SERVICE_STATUSES.join(", ")}` };
  }
  if (query.approved !== undefined && query.approved !== "true" && query.approved !== "false") {
    return { error: 'approved must be "true" or "false"' };
  }
  if (query.sortBy !== undefined && !SORT_FIELDS.includes(query.sortBy)) {
    return { error: `sortBy must be one of: ${SORT_FIELDS.join(", ")}` };
  }
  if (query.sortOrder !== undefined && query.sortOrder !== "asc" && query.sortOrder !== "desc") {
    return { error: 'sortOrder must be "asc" or "desc"' };
  }

  let limit = 50;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: "limit must be an integer between 1 and 100" };
  }
  let offset = 0;
  if (query.offset !== undefined) {
    offset = Number(query.offset);
    if (!Number.isInteger(offset) || offset < 0) return { error: "offset must be a non-negative integer" };
  }

  const where = {};
  const search = (query.search ?? "").trim();
  if (search) {
    const re = new RegExp(escapeRegExp(search), "i");
    where.$or = [
      { serviceName: { $regex: re } },
      { category: { $regex: re } },
      { description: { $regex: re } },
      { location: { $regex: re } },
    ];
  }
  if (query.category) where.category = query.category;
  if (query.location) where.location = query.location;
  if (query.status) where.status = query.status;
  if (query.approved !== undefined) where.approved = query.approved === "true";

  return { where, limit, offset, sortBy: query.sortBy ?? "createdAt", sortOrder: query.sortOrder ?? "desc" };
}

export function adminServicesRoutes(app) {
  // Admin: list all services (search, filter, sort, pagination).
  app.get("/api/admin/services", requireAdmin, async (req, res, next) => {
    try {
      const options = parseAdminOptions(req.query);
      if (options.error) return badRequest(res, options.error);
      const list = await services
        .find(options.where)
        .sort({ [options.sortBy]: options.sortOrder === "asc" ? 1 : -1 })
        .skip(options.offset)
        .limit(options.limit)
        .toArray();
      const total = await services.countDocuments(options.where);
      res.status(200).json({ services: list, total });
    } catch (err) {
      next(err);
    }
  });

  // Admin: approve a service (required before publishing).
  app.post("/api/admin/services/:id/approve", requireAdmin, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service) return notFound(res);
      await services.updateOne({ _id: service._id }, { $set: { approved: true } });
      const updated = await findServiceById(req.params.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Admin: reject a service.
  app.post("/api/admin/services/:id/reject", requireAdmin, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service) return notFound(res);
      await services.updateOne({ _id: service._id }, { $set: { approved: false } });
      const updated = await findServiceById(req.params.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Admin: change the published status of a service (active/inactive).
  app.patch("/api/admin/services/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service) return notFound(res);

      const body = req.body ?? {};
      if (body.status !== "active" && body.status !== "inactive") {
        return badRequest(res, 'status must be "active" or "inactive"');
      }

      if (body.status === "active") {
        // Publishing requires admin approval first.
        if (service.approved !== true) {
          return forbidden(res, "Approve the service before changing it to active");
        }
        // Enforce the free-vendor limit (excluding this service itself).
        const user = await getUserById(service.vendorId);
        if (!isPremiumVendor(user)) {
          const active = await activeServiceCount(service.vendorId, service._id);
          if (active >= 3) {
            return forbidden(res, "Free vendors can have at most 3 active services");
          }
        }
      }

      await services.updateOne({ _id: service._id }, { $set: { status: body.status } });
      const updated = await findServiceById(req.params.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Admin: delete any service.
  app.delete("/api/admin/services/:id", requireAdmin, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service) return notFound(res);
      await services.deleteOne({ _id: service._id });
      res.status(200).json({ ok: true, id: service._id.toString() });
    } catch (err) {
      next(err);
    }
  });
}
