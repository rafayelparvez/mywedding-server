import { ObjectId } from "mongodb";

import { authAdapter } from "../auth/index.js";
import { services } from "../db/collections.js";

// Plans that count as "premium" for the 3-active-services limit.
export const PREMIUM_PLANS = ["premium", "business", "enterprise"];
export const SERVICE_STATUSES = ["pending", "active", "inactive"];

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

export function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isPremiumVendor(user) {
  if (!user?.subscriptionPlan || !PREMIUM_PLANS.includes(user.subscriptionPlan)) return false;
  const expiresAt = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return false;
  return true;
}

export async function findServiceById(serviceId) {
  if (typeof serviceId !== "string" || serviceId.length === 0) return null;
  let id;
  try {
    id = new ObjectId(serviceId);
  } catch {
    return null;
  }
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
