import { services } from "../db/collections.js";
import { badRequest, findServiceById, isNonEmptyString, notFound } from "../utils/services.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SORT_FIELDS = ["price", "createdAt"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validates query params for the public services list. Returns the where
 * clause + list options, or `{ error }` on invalid input.
 */
function parsePublicOptions(query) {
  if (query.search !== undefined && typeof query.search !== "string") {
    return { error: "search must be a string" };
  }
  if (query.category !== undefined && !isNonEmptyString(query.category)) {
    return { error: "category must be a non-empty string" };
  }
  if (query.location !== undefined && !isNonEmptyString(query.location)) {
    return { error: "location must be a non-empty string" };
  }
  if (query.sortBy !== undefined && !SORT_FIELDS.includes(query.sortBy)) {
    return { error: `sortBy must be one of: ${SORT_FIELDS.join(", ")}` };
  }
  if (query.sortOrder !== undefined && query.sortOrder !== "asc" && query.sortOrder !== "desc") {
    return { error: 'sortOrder must be "asc" or "desc"' };
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return { error: `limit must be an integer between 1 and ${MAX_LIMIT}` };
    }
  }
  let offset = 0;
  if (query.offset !== undefined) {
    offset = Number(query.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      return { error: "offset must be a non-negative integer" };
    }
  }

  // Only approved and active services are public.
  const where = { approved: true, status: "active" };
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

  return { where, limit, offset, sortBy: query.sortBy ?? "price", sortOrder: query.sortOrder ?? "asc" };
}

export function publicServicesRoutes(app) {
  // Public: approved + active services.
  app.get("/api/services", async (req, res, next) => {
    try {
      const options = parsePublicOptions(req.query);
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

  // Public: details of an approved + active service.
  app.get("/api/services/:id", async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service || service.approved !== true || service.status !== "active") {
        return notFound(res);
      }
      res.status(200).json(service);
    } catch (err) {
      next(err);
    }
  });
}
