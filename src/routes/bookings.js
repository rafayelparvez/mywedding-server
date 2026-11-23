import { bookings } from '../db/collections.js';
import { bookingCreateLimiter } from '../middleware/rateLimit.js';
import {
  BOOKING_TEXT_LIMITS,
  badRequest,
  findServiceById,
  forbidden,
  isBoundedString,
  isNonEmptyString,
  notFound,
  toObjectId,
} from '../utils/services.js';
import { findBookingById, isBookingStatus, statusFilter } from '../utils/bookings.js';

/**
 * Customer booking routes.
 * All routes are under /api and already authenticated by the app-level
 * `authenticate` middleware; customer identity comes only from `req.user`.
 */

const MAX_LIST_RESULTS = 200;

export function bookingsRoutes(app) {
  // POST /api/bookings — Create a booking request
  app.post('/api/bookings', bookingCreateLimiter, async (req, res, next) => {
    try {
      // Admins cannot create customer bookings
      if (req.user.role === 'admin') {
        return forbidden(res, 'Admins cannot create customer bookings');
      }

      const customerId = req.user.id;
      const { serviceId, eventDate, eventLocation, message } = req.body ?? {};

      if (!isNonEmptyString(serviceId)) {
        return badRequest(res, 'serviceId is required');
      }
      const serviceObjectId = toObjectId(serviceId);
      if (!serviceObjectId) {
        return badRequest(res, 'serviceId must be a valid service id');
      }
      if (typeof eventDate !== 'string' || eventDate.trim().length === 0) {
        return badRequest(res, 'eventDate is required');
      }
      const parsedEventDate = new Date(eventDate);
      if (Number.isNaN(parsedEventDate.getTime())) {
        return badRequest(res, 'Invalid eventDate format');
      }
      if (
        eventLocation !== undefined &&
        (typeof eventLocation !== 'string' || eventLocation.length > BOOKING_TEXT_LIMITS.eventLocation)
      ) {
        return badRequest(res, `eventLocation must be a string of at most ${BOOKING_TEXT_LIMITS.eventLocation} characters`);
      }
      if (message !== undefined && typeof message !== 'string') {
        return badRequest(res, 'message must be a string');
      }
      if (typeof message === 'string' && message.length > BOOKING_TEXT_LIMITS.message) {
        return badRequest(res, `message must be at most ${BOOKING_TEXT_LIMITS.message} characters`);
      }

      const service = await findServiceById(serviceId);
      if (!service) return notFound(res, 'Service not found');

      // Only approved and active services can be booked
      if (service.approved !== true || service.status !== 'active') {
        return badRequest(res, 'Service must be approved and active to be booked');
      }

      // Vendors cannot book their own services
      if (service.vendorId === customerId) {
        return badRequest(res, 'Vendors cannot book their own services');
      }

      // Matches the partial unique index: one pending request per service + customer.
      const duplicateBooking = await bookings.findOne({
        serviceId: serviceObjectId,
        customerId,
        status: statusFilter('pending'),
      });
      if (duplicateBooking) {
        return res.status(409).json({
          error: { status: 409, message: 'You already have a pending booking request for this service' },
        });
      }

      const bookingDoc = {
        serviceId: serviceObjectId,
        vendorId: service.vendorId,
        customerId,
        eventDate: parsedEventDate,
        eventLocation: eventLocation || '',
        message: message || '',
        status: 'pending',
        createdAt: new Date(),
      };

      try {
        const result = await bookings.insertOne(bookingDoc);
        return res.status(201).json({ ...bookingDoc, _id: result.insertedId });
      } catch (err) {
        // Duplicate key from the partial unique index (concurrent requests).
        if (err?.code === 11000) {
          return res.status(409).json({
            error: { status: 409, message: 'You already have a pending booking request for this service' },
          });
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bookings — Get own bookings
  app.get('/api/bookings', async (req, res, next) => {
    try {
      const list = await bookings
        .find({ customerId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(MAX_LIST_RESULTS)
        .toArray();
      res.status(200).json({ bookings: list });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bookings/:id — Get booking details (customer, owning vendor, admin)
  app.get('/api/bookings/:id', async (req, res, next) => {
    try {
      const booking = await findBookingById(req.params.id);
      if (!booking) return notFound(res, 'Booking not found');

      const isCustomer = booking.customerId === req.user.id;
      const isVendor = booking.vendorId === req.user.id;
      if (!isCustomer && !isVendor && req.user.role !== 'admin') {
        return forbidden(res, 'You do not have access to this booking');
      }

      res.status(200).json(booking);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bookings/:id/cancel — Cancel own pending booking
  app.patch('/api/bookings/:id/cancel', async (req, res, next) => {
    try {
      const booking = await findBookingById(req.params.id);
      if (!booking) return notFound(res, 'Booking not found');

      if (booking.customerId !== req.user.id) {
        return forbidden(res, 'You do not have access to cancel this booking');
      }
      if (!isBookingStatus(booking.status, 'pending')) {
        return badRequest(res, 'Only pending bookings can be cancelled');
      }

      await bookings.updateOne(
        { _id: booking._id, status: statusFilter('pending') },
        { $set: { status: 'cancelled' } }
      );

      const updated = await bookings.findOne({ _id: booking._id });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });
}
