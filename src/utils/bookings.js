import { bookings } from "../db/collections.js";
import { toObjectId } from "./services.js";

/** Canonical lowercase booking statuses (matches the MongoDB validator). */
export const BOOKING_STATUSES = ["pending", "accepted", "rejected", "cancelled"];

/** Case-insensitive status check for legacy rows written with "Pending". */
export function isBookingStatus(value, expected) {
  return typeof value === "string" && value.toLowerCase() === expected;
}

/**
 * Mongo filter that matches both the canonical lowercase status and the legacy
 * capitalized form, so rows created before the status casing fix stay visible.
 */
export function statusFilter(status) {
  return {
    $in: [status, status.charAt(0).toUpperCase() + status.slice(1)],
  };
}

export async function findBookingById(bookingId) {
  const id = toObjectId(bookingId);
  if (!id) return null;
  return bookings.findOne({ _id: id });
}
