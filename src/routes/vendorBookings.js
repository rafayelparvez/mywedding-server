import { bookings } from '../db/collections.js';
import { requireVendor } from '../middleware/authorize.js';
import { badRequest, forbidden, notFound } from '../utils/services.js';
import { findBookingById, isBookingStatus, statusFilter } from '../utils/bookings.js';

/**
 * Vendor booking management routes.
 * All routes are under /api and already authenticated; `requireVendor` enforces
 * the vendor role. A vendor can only manage bookings for their own services.
 */

const MAX_LIST_RESULTS = 200;

/** Loads a booking and verifies the current vendor owns it. Responds on failure. */
async function loadOwnedBooking(req, res) {
  const booking = await findBookingById(req.params.id);
  if (!booking) {
    notFound(res, 'Booking not found');
    return null;
  }
  if (booking.vendorId !== req.user.id) {
    forbidden(res, 'You do not have access to manage this booking');
    return null;
  }
  return booking;
}

async function setStatus(req, res, next, nextStatus) {
  try {
    const booking = await loadOwnedBooking(req, res);
    if (!booking) return;

    if (!isBookingStatus(booking.status, 'pending')) {
      return badRequest(res, 'Only pending requests can be accepted or rejected');
    }

    // Guard on the old status so two concurrent decisions cannot overwrite each other.
    await bookings.updateOne(
      { _id: booking._id, status: statusFilter('pending') },
      { $set: { status: nextStatus, respondedAt: new Date() } }
    );

    const updated = await bookings.findOne({ _id: booking._id });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

export function vendorBookingsRoutes(app) {
  // GET /api/bookings/vendor — Pending requests for the vendor's own services
  app.get('/api/bookings/vendor', requireVendor, async (req, res, next) => {
    try {
      const list = await bookings
        .find({ vendorId: req.user.id, status: statusFilter('pending') })
        .sort({ createdAt: -1 })
        .limit(MAX_LIST_RESULTS)
        .toArray();

      res.status(200).json({ bookings: list });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bookings/:id/accept — Accept a pending request
  app.patch('/api/bookings/:id/accept', requireVendor, (req, res, next) =>
    setStatus(req, res, next, 'accepted')
  );

  // PATCH /api/bookings/:id/reject — Reject a pending request
  app.patch('/api/bookings/:id/reject', requireVendor, (req, res, next) =>
    setStatus(req, res, next, 'rejected')
  );
}
