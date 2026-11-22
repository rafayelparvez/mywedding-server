import fetch from 'node-fetch';

// Supported image MIME types for ImgBB upload
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Maximum file size in bytes (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Upload an image buffer to ImgBB and return the hosted URL.
 * This function runs entirely on the server — the IMGBB_API_KEY is never
 * sent to the browser.
 *
 * @param {Buffer} imageBuffer - The image file buffer
 * @param {string} mimeType - The MIME type of the image
 * @returns {Promise<string>} The hosted image URL
 * @throws {Error} If the upload fails or validation fails
 */
export async function uploadImage(imageBuffer, mimeType) {
  // 1. Validate MIME type
  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    const supported = SUPPORTED_IMAGE_TYPES.join(', ');
    throw new Error(`Unsupported image type: ${mimeType}. Supported types: ${supported}`);
  }

  // 2. Validate file size
  if (imageBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${imageBuffer.length} bytes. Maximum: ${MAX_FILE_SIZE} bytes (10MB)`);
  }

  // 3. Convert buffer to base64 string
  const base64String = imageBuffer.toString('base64');

  // 4. Retrieve ImgBB API key from server-side environment only
  //    (dotenv is loaded in src/config/env.js, process.env is available here)
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new Error('ImgBB API key not configured on the server');
  }

  // 5. Call ImgBB API
  const url = 'https://api.imgbb.com/1/upload';
  const params = {
    key: apiKey,
    image: base64String,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ImgBB API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`ImgBB error: ${data.error.message || 'Unknown ImgBB error'}`);
  }

  // 6. Return the hosted image URL
  // The response structure: { success: true, data: { display_url: '...', ... } }
  if (data.data && data.data.display_url) {
    return data.data.display_url;
  }

  throw new Error('Unexpected ImgBB response format: missing display_url');
}

/**
 * Middleware for handling profile image uploads.
 * Expects a multipart/form-data POST with a file field named "image".
 * Validates file type and size, uploads to ImgBB, and attaches the URL
 * to the authenticated user's profile.
 */
export function profileImageUploadMiddleware() {
  return async (req, res, next) => {
    try {
      // Multer (or similar) should have populated req.file
      // If no file uploaded, delegate to the next handler
      if (!req.file) {
        return next();
      }

      // Validate MIME type
      if (!SUPPORTED_IMAGE_TYPES.includes(req.file.mimeType)) {
        return res.status(400).json({
          error: { status: 400, message: `Unsupported image type: ${req.file.mimeType}` },
        });
      }

      // Validate file size
      if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: { status: 400, message: `File too large. Maximum: ${MAX_FILE_SIZE} bytes (10MB)` },
        });
      }

      // Upload to ImgBB and get the hosted URL
      const hostedUrl = await uploadImage(req.file.buffer, req.file.mimeType);

      // Attach the URL to the request body for the route handler
      // The existing route expects req.body.image to be a string URL
      req.body = { image: hostedUrl };

      next();
    } catch (err) {
      console.error('[imgbb] upload failed:', err);
      next(err);
    }
  };
}