// Built-in fetch is available in Node.js 18+ (Express 5 requires Node ≥ 18).
// No external HTTP dependency needed.

import { env } from "../config/env.js";

// Supported image MIME types for ImgBB upload
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Maximum file size in bytes (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Error type that carries a safe HTTP status for the centralized handler. */
export class ImageUploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ImageUploadError";
    this.status = status;
    this.expose = true;
  }
}

/** Detects the real image type from magic bytes (never trust the client MIME). */
function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function mimeMatches(detected, declared) {
  if (!detected || !declared) return false;
  if (detected === declared) return true;
  // image/jpg is a common non-standard alias for image/jpeg.
  return detected === "image/jpeg" && declared === "image/jpg";
}

/**
 * Upload an image buffer to ImgBB and return the hosted URL.
 * Runs entirely on the server — the API key is never sent to the browser.
 *
 * @param {Buffer} imageBuffer - The image file buffer
 * @param {string} mimeType - The declared MIME type
 * @returns {Promise<string>} The hosted image URL
 * @throws {ImageUploadError} For invalid input / configuration / upstream errors
 */
export async function uploadImage(imageBuffer, mimeType) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new ImageUploadError("Image file is empty");
  }

  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new ImageUploadError(
      `Unsupported image type: ${mimeType}. Supported types: ${SUPPORTED_IMAGE_TYPES.join(", ")}`
    );
  }

  if (imageBuffer.length > MAX_FILE_SIZE) {
    throw new ImageUploadError("File too large. Maximum size is 10MB.", 413);
  }

  const detected = detectImageMime(imageBuffer);
  if (!mimeMatches(detected, mimeType)) {
    throw new ImageUploadError("File content does not match a supported image type");
  }

  const apiKey = env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new ImageUploadError("Image uploads are not configured on the server", 503);
  }

  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      image: imageBuffer.toString("base64"),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[imgbb] upstream error (${response.status}):`, errorText.slice(0, 500));
    throw new ImageUploadError("Image upload failed. Please try again.", 502);
  }

  const data = await response.json().catch(() => null);
  const hostedUrl = data?.data?.display_url;
  if (!hostedUrl || typeof hostedUrl !== "string") {
    console.error("[imgbb] unexpected response shape");
    throw new ImageUploadError("Image upload failed. Please try again.", 502);
  }

  return hostedUrl;
}
