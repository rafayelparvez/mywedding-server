/**
 * Centralized error handling for the Express app.
 *
 * Every error — thrown in a route, rejected promise (Express 5), or passed via
 * next(err) — ends up here. It responds with a consistent JSON shape:
 *
 *   { error: { status, message } }
 *
 * 5xx messages are hidden from clients; details are logged server-side.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // Response already started; nothing more we can do.
    return res.end();
  }

  const requestedStatus = Number.isInteger(err?.status) ? err.status : 500;
  const status = requestedStatus >= 400 && requestedStatus < 600 ? requestedStatus : 500;
  const message = status >= 500 ? "Internal server error" : err?.message || "Bad request";

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.url} → ${status}`, err);
  }

  res.status(status).json({ error: { status, message } });
}
