import { ObjectId } from "mongodb";

import { authAdapter } from "../auth/index.js";
import { services } from "../db/collections.js";

// Plans that count as "premium" for the 3-active-services limit.
export const PREMIUM_PLANS = ["premium", "business", "enterprise"];
export const SERVICE_STATUSES = ["pending", "active", "inactive"];

// Storage limits. These bound request bodies and protect stored text/images
// from abuse without rejecting normal marketplace content.
export const SERVICE_TEXT_LIMITS = {
  serviceName: 200,
  category: 100,
  description: 5000,
  location: 200,
};
export const MAX_SERVICE_IMAGES = 10;
export const MAX_IMAGE_REFERENCE_LENGTH = 2_000_000; // ~2 MB (data URLs)
export const BOOKING_TEXT_LIMITS = {
  eventLocation: 300,
  message: 3000,
};
export const PROFILE_NAME_MAX_LENGTH = 100;

const DATA_IMAGE_RE = /^data:image\/(?:jpeg|jpg|png|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

export function badRequest(res, message) {
  return res.status(400).json({ error: { status: 400, message } });
}

export function notFound(res, message = "Not found") {
  return res.status(404).json({ error: { status: 404, message } });
}

export function forbidden(res, message) {
  return res.status(403).json({ error: { status: 403, message } });
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** Non-empty (after trim) string no longer than `max` characters. */
export function isBoundedString(value, max) {
  return isNonEmptyString(value) && value.trim().length <= max;
}

export function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Accepts a relative path, an http(s) URL, or a raster image data URL.
 * Blocks `javascript:`, `data:text/html`, SVG data URLs and other payloads
 * that could execute script when rendered by the frontend.
 */
export function isSafeImageReference(value) {
  if (!isNonEmptyString(value)) return false;
  const candidate = value.trim();
  if (candidate.length > MAX_IMAGE_REFERENCE_LENGTH) return false;
  if (candidate.startsWith("data:")) return DATA_IMAGE_RE.test(candidate);
  if (candidate.startsWith("/")) return !candidate.startsWith("//");
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Parses a 24-hex Mongo ObjectId string, or returns null. */
export function toObjectId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

export function isPremiumVendor(user) {
  if (!user?.subscriptionPlan || !PREMIUM_PLANS.includes(user.subscriptionPlan)) return false;
  const expiresAt = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return false;
  return true;
}

export async function findServiceById(serviceId) {
  const id = toObjectId(serviceId);
  if (!id) return null;
  return services.findOne({ _id: id });
}

export async function activeServiceCount(vendorId, excludeId = null) {
  const where = { vendorId, status: "active" };
  if (excludeId) where._id = { $ne: excludeId };
  return services.countDocuments(where);
}

export async function getUserById(userId) {
  if (typeof userId !== "string" || userId.length === 0) return null;
  try {
    const adapter = await authAdapter();
    return await adapter.findOne({ model: "user", where: [{ field: "id", value: userId }] });
  } catch {
    return null;
  }
}
