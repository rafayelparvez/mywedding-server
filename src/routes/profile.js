import { authAdapter } from "../auth/index.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { imageUploadLimiter } from "../middleware/rateLimit.js";
import { uploadImage } from "../utils/imgbb.js";

// Fields users may change on their own profile. Everything else (role,
// blocked status, subscription info, …) is admin/read-only.
const ALLOWED_PROFILE_FIELDS = new Set(["name"]);

export function profileRoutes(app) {
  // GET /api/profile — current profile (read view of the user record).
  app.get("/api/profile", (req, res) => {
    res.status(200).json(req.user);
  });

  // PATCH /api/profile — update permitted profile information.
  app.patch("/api/profile", async (req, res, next) => {
    const body = req.body ?? {};

    // Reject any field the user cannot change (users cannot change their own
    // role, blocked status or subscription information).
    for (const key of Object.keys(body)) {
      if (!ALLOWED_PROFILE_FIELDS.has(key)) {
        return res.status(400).json({
          error: { status: 400, message: `Field "${key}" cannot be changed via /api/profile` },
        });
      }
    }

    const name = body.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { status: 400, message: "name must be a non-empty string" } });
    }

    try {
      const adapter = await authAdapter();
      const updated = await adapter.update({
        model: "user",
        where: [{ field: "id", value: req.user.id }],
        update: { name: name.trim() },
      });
      if (!updated) {
        return res.status(404).json({ error: { status: 404, message: "User not found" } });
      }
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/profile/image — update the profile image.
  // Expects multipart/form-data with a file field named "image".
  // multer parses the file into req.file; we validate it, upload to ImgBB,
  // and store the hosted URL on the user record.
  app.patch("/api/profile/image", imageUploadLimiter, uploadSingleImage, async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: { status: 400, message: "No image file provided" } });
      }

      // multer exposes the declared type as `mimetype` (lowercase).
      const image = await uploadImage(req.file.buffer, req.file.mimetype);

      const adapter = await authAdapter();
      const updated = await adapter.update({
        model: "user",
        where: [{ field: "id", value: req.user.id }],
        update: { image },
      });
      if (!updated) {
        return res.status(404).json({ error: { status: 404, message: "User not found" } });
      }
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });
}
