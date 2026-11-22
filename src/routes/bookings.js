import { bookings } from '../db/collections.js';
import { ObjectId } from 'mongodb';
import { findServiceById, isNonEmptyString } from '../utils/services.js';
import { authenticate } from '../middleware/authenticate.js';

/**
 * Customer booking routes.
 * All routes are under /api and require valid authentication.
 * Customer identity is derived from the verified JWT (req.user), never trusted from client input.
 */

export function bookingsRoutes(app) {
  // POST /api/bookings — Create a booking request
  app.post('/api/bookings', authenticate, async (req, res, next) => {
    try {
      // Admins cannot create customer bookings
      if (req.user.role === 'admin') {
        return res.status(403).json({ error: { status: 403, message: 'Admins cannot create customer bookings' } });
      }

      // Derive customer identity from verified authentication — never trust client-provided IDs
      const customerId = req.user.id;
      const { serviceId, eventDate, eventLocation, message } = req.body ?? {};

      // Validate required fields
      if (!serviceId || typeof serviceId !== 'string') {
        return res.status(400).json({ error: { status: 400, message: 'serviceId is required' } });
      }
      if (!eventDate) {
        return res.status(400).json({ error: { status: 400, message: 'eventDate is required' } });
      }

      // Look up the service — validates service exists and is valid
      const service = await findServiceById(serviceId);
      if (!service) {
        return res.status(404).json({ error: { status: 404, message: 'Service not found' } });
      }

      // Only approved and active services can be booked
      if (service.approved !== true || service.status !== 'active') {
        return res.status(400).json({ error: { status: 400, message: 'Service must be approved and active to be booked' } });
      }

      // Vendors cannot book their own services
      if (service.vendorId === customerId) {
        return res.status(400).json({ error: { status: 400, message: 'Vendors cannot book their own services' } });
      }

      // Parse eventDate as Date
      const parsedEventDate = new Date(eventDate);
      if (isNaN(parsedEventDate.getTime())) {
        return res.status(400).json({ error: { status: 400, message: 'Invalid eventDate format' } });
      }

      // Prevent duplicate active booking requests for the same service and event date
      // Check for existing Pending bookings for the same service and event date by the same customer
      const duplicateBooking = await bookings.findOne({
        serviceId: new ObjectId(serviceId),
        customerId,
        eventDate: parsedEventDate,
        status: 'Pending'
      });

      if (duplicateBooking) {
        return res.status(400).json({ error: { status: 400, message: 'You already have a pending booking request for this service on this event date' } });
      }

      // Create the booking — server sets vendorId, status, and createdAt
      const createdAt = new Date();
      const bookingDoc = {
        serviceId: new ObjectId(serviceId),
        vendorId: service.vendorId,
        customerId,
        eventDate: parsedEventDate,
        eventLocation: eventLocation || '',
        message: message || '',
        status: 'Pending',
        createdAt
      };

      const result = await bookings.insertOne(bookingDoc);

      res.status(201).json({ ...bookingDoc, _id: result.insertedId });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bookings — Get own bookings
  app.get('/api/bookings', authenticate, async (req, res, next) => {
    try {
      const customerId = req.user.id;
      const list = await bookings.find({ customerId }).sort({ createdAt: -1 }).toArray();
      res.status(200).json({ bookings: list });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bookings/:id — Get booking details
  app.get('/api/bookings/:id', authenticate, async (req, res, next) => {
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

      // Check authorization — user can only see their own bookings
      if (booking.customerId !== req.user.id) {
        return res.status(403).json({ error: { status: 403, message: 'You do not have access to this booking' } });
      }

      res.status(200).json(booking);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bookings/:id/cancel — Cancel pending booking
  app.patch('/api/bookings/:id/cancel', authenticate, async (req, res, next) => {
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

      // Check authorization — user can only cancel their own bookings
      if (booking.customerId !== req.user.id) {
        return res.status(403).json({ error: { status: 403, message: 'You do not have access to cancel this booking' } });
      }

      // Only Pending bookings can be cancelled
      if (booking.status !== 'Pending') {
        return res.status(400).json({ error: { status: 400, message: 'Only pending bookings can be cancelled' } });
      }

      await bookings.updateOne({ _id: objectId }, { $set: { status: 'Cancelled' } });

      const updated = await bookings.findOne({ _id: objectId });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });
}