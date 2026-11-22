import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { adminUsersRoutes } from './routes/adminUsers.js';
import { profileRoutes } from './routes/profile.js';
import { publicServicesRoutes } from './routes/publicServices.js';
import { vendorServicesRoutes } from './routes/vendorServices.js';
import { adminServicesRoutes } from './routes/adminServices.js';
import { bookingsRoutes } from './routes/bookings.js';
import { vendorBookingsRoutes } from './routes/vendorBookings.js';
import { serviceImageRoutes } from './routes/serviceImages.js';

export function createApp() {
  const app = express();

  // Browser calls come from CLIENT_URL. Credentials are enabled because the
  // app authenticates with cookies; the origin is the configured CLIENT_URL —
  // in production it is required, so wildcard CORS is structurally excluded.
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json());

  healthRoutes(app);

  // Public services — must be registered before the /api authentication middleware.
  publicServicesRoutes(app);

  // Protect all other /api routes: verify the Better Auth JWT, then attach req.user.
  app.use('/api', authenticate);
  profileRoutes(app);
  vendorServicesRoutes(app);
  adminServicesRoutes(app);
  adminUsersRoutes(app);
  meRoutes(app);

  // Customer booking routes — protected by authentication
  bookingsRoutes(app);

  // Vendor booking management routes — protected by vendor authentication
  vendorBookingsRoutes(app);

  // Service image upload routes — protected by vendor authentication
  serviceImageRoutes(app);

  // 404: anything unmatched becomes a JSON error response (see errorHandler).
  app.use((req, res, next) => {
    const err = new Error(`Cannot ${req.method} ${req.url}`);
    err.status = 404;
    next(err);
  });

  // Centralized error handling — last middleware, catches routes + 404s above.
  app.use(errorHandler);

  return app;
}
