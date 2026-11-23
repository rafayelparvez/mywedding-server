import multer from "multer";

import { SUPPORTED_IMAGE_TYPES, MAX_FILE_SIZE, ImageUploadError } from "../utils/imgbb.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 20,
    parts: 30,
  },
  fileFilter(req, file, cb) {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(
        new ImageUploadError(
          `Unsupported image type. Supported types: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
          400
        )
      );
    }
    return cb(null, true);
  },
});

/**
 * Parses one `multipart/form-data` file field named "image" into memory.
 * Byte-level (magic number) validation happens in `uploadImage`.
 */
export const uploadSingleImage = upload.single("image");
