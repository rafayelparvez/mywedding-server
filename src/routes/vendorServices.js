import { ObjectId } from "mongodb";

import { requireVendor } from "../middleware/authorize.js";
import { services } from "../db/collections.js";
import {
  activeServiceCount,
  badRequest,
  findServiceById,
  forbidden,
  isPremiumVendor,
  isNonEmptyString,
  isNonNegativeNumber,
  notFound,
} from "../utils/services.js";

const fieldErrors = {
  serviceName: "serviceName must be a non-empty string",
  category: "category must be a non-empty string",
  description: "description must be a non-empty string",
  price: "price must be a non-negative number",
  location: "location must be a non-empty string",
  images: "images must be an array of non-empty strings",
};

/**
 * Validates the updatable/creatable fields of a service. Returns the
 * validated fields or `{ error }`.
 *
 * With `requireAll: true` (create), serviceName/category/description/price are
 * all required. With `requireAll: false` (update), only present fields are
 * validated.
 */
function validateServiceFields(body, { requireAll = true } = {}) {
  const result = {};
  const validators = {
    serviceName: isNonEmptyString,
    category: isNonEmptyString,
    description: isNonEmptyString,
    price: isNonNegativeNumber,
    location: (v) => v === undefined || isNonEmptyString(v),
    images: (v) => v === undefined || (Array.isArray(v) && v.every((i) => isNonEmptyString(i))),
  };
  for (const field of Object.keys(validators)) {
    const value = body[field];
    if (value === undefined) continue;
    if (!validators[field](value)) return { error: fieldErrors[field] };
    result[field] = field === "images" ? value.map((i) => i.trim()) : value;
  }
  if (requireAll) {
    for (const field of ["serviceName", "category", "description", "price"]) {
      if (!(field in result)) return { error: fieldErrors[field] };
    }
  }
  return result;
}

export function vendorServicesRoutes(app) {
  // Vendor: create a service. New services default to Pending.
  app.post("/api/services", requireVendor, async (req, res, next) => {
    try {
      const validated = validateServiceFields(req.body ?? {});
      if (validated.error) return badRequest(res, validated.error);

      const doc = {
        _id: new ObjectId(),
        vendorId: req.user.id,
        serviceName: validated.serviceName,
        category: validated.category,
        description: validated.description,
        price: validated.price,
        approved: false,
        status: "pending",
        createdAt: new Date(),
      };
      if (validated.location) doc.location = validated.location;
      if (validated.images) doc.images = validated.images;

      await services.insertOne(doc);
      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  });

  // Vendor: list own services (all statuses).
  app.get("/api/vendor/services", requireVendor, async (req, res, next) => {
    try {
      const list = await services.find({ vendorId: req.user.id }).sort({ createdAt: -1 }).toArray();
      res.status(200).json({ services: list });
    } catch (err) {
      next(err);
    }
  });

  // Vendor: update own service. Status changes go through publish/unpublish.
  app.patch("/api/services/:id", requireVendor, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service || service.vendorId !== req.user.id) return notFound(res);

      const body = req.body ?? {};
      if (body.status !== undefined) return badRequest(res, "status can only be changed via the publish/unpublish endpoints");
      if (body.approved !== undefined) return badRequest(res, "approved is managed by admins");
      if (body.vendorId !== undefined || body.createdAt !== undefined) {
        return badRequest(res, "vendorId and createdAt are read-only");
      }

      const validated = validateServiceFields(body, { requireAll: false });
      if (validated.error) return badRequest(res, validated.error);
      if (Object.keys(validated).length === 0) return badRequest(res, "Nothing to update");

      await services.updateOne({ _id: service._id }, { $set: validated });
      const updated = await findServiceById(req.params.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Vendor: delete own service.
  app.delete("/api/services/:id", requireVendor, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service || service.vendorId !== req.user.id) return notFound(res);
      await services.deleteOne({ _id: service._id });
      res.status(200).json({ ok: true, id: service._id.toString() });
    } catch (err) {
      next(err);
    }
  });

  // Vendor: publish (set status active). Requires admin approval first, and
  // free vendors are limited to 3 active services.
  app.post("/api/services/:id/publish", requireVendor, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service || service.vendorId !== req.user.id) return notFound(res);
      if (service.approved !== true) {
        return forbidden(res, "Admin approval is required before publishing");
      }
      if (!isPremiumVendor(req.user)) {
        const active = await activeServiceCount(req.user.id, service._id);
        if (active >= 3) return forbidden(res, "Free vendors can have at most 3 active services");
      }
      await services.updateOne({ _id: service._id }, { $set: { status: "active" } });
      const updated = await findServiceById(req.params.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Vendor: unpublish (set status inactive).
  app.post("/api/services/:id/unpublish", requireVendor, async (req, res, next) => {
    try {
      const service = await findServiceById(req.params.id);
      if (!service || service.vendorId !== req.user.id) return notFound(res);
      await services.updateOne({ _id: service._id }, { $set: { status: "inactive" } });
      const updated = await findServiceById(req.params.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });
}
