/**
 * Centralized error handling for the Express app.
 *
 * Every error — thrown in a route, rejected promise (Express 5), or passed via
 * next(err) — ends up here. It responds with a consistent JSON shape:
 *
 *   { error: { status, message } }
 *
 * 5xx messages are hidden from clients unless the error explicitly opts in
 * (`err.expose`); details are logged server-side.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // Response already started; nothing more we can do.
    return res.end();
  }

  let requestedStatus = Number.isInteger(err?.status) ? err.status : 500;
  let message = err?.message || "Bad request";

  // Normalize common body-parser / upload errors into safe client messages.
  if (err?.type === "entity.parse.failed") {
    requestedStatus = 400;
    message = "Invalid JSON body";
  } else if (err?.type === "entity.too.large" || err?.code === "LIMIT_FILE_SIZE") {
    requestedStatus = 413;
    message = "Request body is too large";
  } else if (err?.name === "MulterError") {
    requestedStatus = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Image file is too large (max 10MB)" : "Invalid upload";
  }

  const status = requestedStatus >= 400 && requestedStatus < 600 ? requestedStatus : 500;
  const safeMessage =
    status >= 500
      ? err?.expose
        ? message
        : "Internal server error"
      : message || "Bad request";

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.url} → ${status}`, err);
  }

  res.status(status).json({ error: { status, message: safeMessage } });
}
