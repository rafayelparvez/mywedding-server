import { services } from '../db/collections.js';
import { findServiceById } from '../utils/services.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireVendor } from '../middleware/authorize.js';
import { uploadImage, SUPPORTED_IMAGE_TYPES, MAX_FILE_SIZE } from '../utils/imgbb.js';

/**
 * Service image upload routes.
 * Expects multipart/form-data with a file field named "image".
 * Validates file type and size, uploads to ImgBB, and updates the service
 * document with the hosted image URL.
 * A vendor can only upload images for their own services.
 */

/**
 * POST /api/services/:id/image — Upload an image for a service.
 * The service must exist and belong to the authenticated vendor.
 * The service must be in a state where images can be added (pending/approved but not yet having images, or active).
 */
export function serviceImageRoutes(app) {
  app.post('/api/services/:id/image', authenticate, requireVendor, async (req, res, next) => {
    try {
      const { id } = req.params;

      // Look up the service
      const service = await findServiceById(id);
      if (!service) {
        return res.status(404).json({ error: { status: 404, message: 'Service not found' } });
      }

      // Check authorization — vendor can only manage their own service images
      if (service.vendorId !== req.user.id) {
        return res.status(403).json({ error: { status: 403, message: 'You do not have access to this service' } });
      }

      // If multer didn't populate req.file, delegate to next handler
      if (!req.file) {
        return res.status(400).json({ error: { status: 400, message: 'No image file provided' } });
      }

      // Upload to ImgBB
      const hostedUrl = await uploadImage(req.file.buffer, req.file.mimeType);

      // Update the service — append the image URL to the existing images array
      const existingImages = service.images || [];
      const updated = await services.updateOne(
        { _id: service._id },
        { $push: { images: hostedUrl } }
      );

      const updatedService = await findServiceById(id);
      res.status(200).json({ image: hostedUrl, service: updatedService });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/services/:id/images — Get all images for a service
  app.get('/api/services/:id/images', authenticate, async (req, res, next) => {
    try {
      const { id } = req.params;

      const service = await findServiceById(id);
      if (!service) {
        return res.status(404).json({ error: { status: 404, message: 'Service not found' } });
      }

      res.status(200).json({ images: service.images || [] });
    } catch (err) {
      next(err);
    }
  });
}