/**
 * Small dependency-free fixed-window rate limiter.
 *
 * State is per-process only: it protects a single instance from request floods.
 * For multi-instance deployments, put a shared limiter (API gateway / Redis)
 * in front of the app as well.
 */

const MAX_TRACKED_KEYS = 10_000;

function defaultKey(req) {
  // `req.user` is available on routes mounted after `authenticate`.
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

/**
 * @param {object} options
 * @param {number} options.windowMs
 * @param {number} options.max
 * @param {string} [options.name] bucket namespace
 * @param {(req: import("express").Request) => string} [options.keyGenerator]
 * @param {string} [options.message]
 */
export function rateLimit({ windowMs, max, name = "default", keyGenerator = defaultKey, message }) {
  const buckets = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = `${name}:${keyGenerator(req)}`;

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const remaining = Math.max(0, max - bucket.count);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      return res.status(429).json({
        error: {
          status: 429,
          message: message || "Too many requests. Please try again later.",
        },
      });
    }

    // Opportunistic cleanup keeps memory bounded under IP churn.
    if (buckets.size > MAX_TRACKED_KEYS) {
      const excess = buckets.size - MAX_TRACKED_KEYS;
      let removed = 0;
      for (const [entryKey, entry] of buckets) {
        if (removed >= excess) break;
        if (now >= entry.resetAt || entryKey !== key) {
          buckets.delete(entryKey);
          removed += 1;
        }
      }
    }

    return next();
  };
}

/** Broad per-IP limit for all /api traffic (including unauthenticated probing). */
export const apiLimiter = rateLimit({
  name: "api",
  windowMs: 60_000,
  max: 300,
  message: "Too many API requests. Please slow down and try again shortly.",
});

/** Stricter limit for expensive / abuse-prone writes. */
export const bookingCreateLimiter = rateLimit({
  name: "booking-create",
  windowMs: 15 * 60_000,
  max: 30,
  message: "Too many booking requests. Please try again later.",
});

export const imageUploadLimiter = rateLimit({
  name: "image-upload",
  windowMs: 15 * 60_000,
  max: 20,
  message: "Too many image uploads. Please try again later.",
});

export const serviceWriteLimiter = rateLimit({
  name: "service-write",
  windowMs: 60 * 60_000,
  max: 60,
  message: "Too many service changes. Please try again later.",
});
