import { bookings } from '../db/collections.js';
import { ObjectId } from 'mongodb';
import { findServiceById, getUserById, isPremiumVendor } from '../utils/services.js';
import { authenticate, requireVendor } from '../middleware/authorize.js';

/**
 * Vendor booking management routes.
 * All routes require valid authentication and vendor role.
 * A vendor can only manage booking requests for their own services.
 */

export function vendorBookingsRoutes(app) {
  // GET /api/bookings/vendor — Get booking requests for own services
  app.get('/api/bookings/vendor', authenticate, requireVendor, async (req, res, next) => {
    try {
      const vendorId = req.user.id;

      // Get all pending booking requests for services owned by this vendor
      // We query bookings where vendorId matches and status is Pending
      const list = await bookings
        .find({ vendorId, status: 'Pending' })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({ bookings: list });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bookings/:id/accept — Accept booking
  app.patch('/api/bookings/:id/accept', authenticate, requireVendor, async (req, res, next) => {
    try {
      const { id } = req.params;
      let objectId;
      try {
        objectId = new ObjectId(id);
      } catch {
        return res.status(400).json({ error: { status: 400, message: 'Invalid booking ID' } });
      }

      const booking = await bookings.findOne({ _id: objectId });
      if (!booking) {
        return res.status(404).json({ error: { status: 404, message: 'Booking not found' } });
      }

      // Check authorization — vendor can only manage their own service bookings
      if (booking.vendorId !== req.user.id) {
        return res.status(403).json({ error: { status: 403, message: 'You do not have access to manage this booking' } });
      }

      // Only Pending requests can be accepted or rejected
      if (booking.status !== 'Pending') {
        return res.status(400).json({ error: { status: 400, message: 'Only pending requests can be accepted or rejected' } });
      }

      await bookings.updateOne({ _id: objectId }, { $set: { status: 'Accepted' } });

      const updated = await bookings.findOne({ _id: objectId });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bookings/:id/reject — Reject booking
  app.patch('/api/bookings/:id/reject', authenticate, requireVendor, async (req, res, next) => {
    try {
      const { id } = req.params;
      let objectId;
      try {
        objectId = new ObjectId(id);
      } catch {
        return res.status(400).json({ error: { status: 400, message: 'Invalid booking ID' } });
      }

      const booking = await bookings.findOne({ _id: objectId });
      if (!booking) {
        return res.status(404).json({ error: { status: 404, message: 'Booking not found' } });
      }

      // Check authorization — vendor can only manage their own service bookings
      if (booking.vendorId !== req.user.id) {
        return res.status(403).json({ error: { status: 403, message: 'You do not have access to manage this booking' } });
      }

      // Only Pending requests can be accepted or rejected
      if (booking.status !== 'Pending') {
        return res.status(400).json({ error: { status: 400, message: 'Only pending requests can be accepted or rejected' } });
      }

      await bookings.updateOne({ _id: objectId }, { $set: { status: 'Rejected' } });

      const updated = await bookings.findOne({ _id: objectId });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });
}