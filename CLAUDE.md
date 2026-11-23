# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | What it does |
|---|---|
| `npm start` | `node index.js` — production start |
| `npm run dev` | `node --watch index.js` — development with file-watch restart |
| `npm test` | Stub: always exits 1. No test framework exists. |

## Environment Setup

Copy `.env.example` to `.env`. Required variables: `MONGODB_URI`, `BETTER_AUTH_SECRET`. The server pings MongoDB on startup and exits 1 if unreachable — no offline mode.

Key env vars:
- `BETTER_AUTH_SECRET` — **must** match the Next.js frontend's `.env`; controls JWT signing
- `BETTER_AUTH_URL` — defaults to `http://localhost:3000`; used as both base URL and JWT issuer
- `CLIENT_URL` — required in production for CORS (development defaults to `http://localhost:3000`)
- `IMGBB_API_KEY` — optional; missing key yields 503 on upload routes only, not startup failure
- `TRUST_PROXY` — set to a hop count (e.g. `"1"`) when behind a reverse proxy for accurate rate-limit IPs
- `STRIPE_*` — values in `.env` but no code reads them yet

## Architecture

**Boot order** (`index.js`): `createApp()` → `connect()` → `ensureCollections()` → `ensureIndexes()` → `listen(PORT)`.

**Middleware order in `src/app.js`** (order matters critically):
1. `securityHeaders` — baseline HTTP security headers
2. `cors({ origin: CLIENT_URL, credentials: true })` — CORS is always pinned, never wildcard
3. `express.json({ limit: '1mb' })` — JSON body parsing (uploads use multipart instead)
4. `apiLimiter` on `/api` — per-IP flood protection
5. `healthRoutes` + `publicServicesRoutes` — **public, registered before auth**
6. `app.use('/api', authenticate)` — all routes after this require a valid JWT
7. `privateNoStore` — no-cache headers on authenticated responses
8. Authenticated routes: profile, vendor services/bookings, admin, customer bookings, service images
9. 404 handler → `errorHandler`

**Important ordering rule**: `vendorBookingsRoutes` must be registered before `bookingsRoutes` because `GET /api/bookings/vendor` would otherwise be matched by `GET /api/bookings/:id` (treating `"vendor"` as an id). This is already fixed in `src/app.js`.

## Auth & Identity

This server **only verifies** JWTs issued by the Next.js Better Auth instance. It never issues tokens.

- `authenticate` middleware (`src/middleware/authenticate.js`): extracts `Bearer <token>`, calls `auth.api.verifyJWT`, DB-looks up the user, rejects blocked accounts, sets `req.user`
- Always derive identity from `req.user.id` — never accept `customerId`, `vendorId`, or `role` from request bodies
- `authorize.js` exports `requireAuth` (alias of `authenticate`), `requireRole(r)`, `requireUser`, `requireVendor`, `requireAdmin`, `isOwner`, `requireOwn`
- Import `authenticate` directly from `src/middleware/authenticate.js` — `authorize.js` does **not** export it
- Role hierarchy: `user (1) < vendor (2) < admin (3)`; unknown roles get level 0

**Routes under `/api` are already authenticated** by the app-level middleware mount. Do not add `authenticate` again inside route handlers — it will just verify the JWT twice.

## Data Model

Three business collections in the `mywedding` database. User/session/account collections belong to Better Auth — do not create them.

**Mixed id types** — critical to get right:
- `services.vendorId`, `bookings.vendorId`, `bookings.customerId` → Better Auth **string** ids
- `services._id`, `bookings.serviceId` → BSON **ObjectId** — convert with `toObjectId()` inside try/catch, return 400/404 on failure

**Collection validators** only apply when first created. `ensureCollections` / `ensureIndexes` are idempotent but changing schemas in `src/db/collections.js` won't update an existing DB. Use `collMod` or drop the collection to apply schema changes.

**Booking statuses** (canonical, lowercase): `"pending"` / `"accepted"` / `"rejected"` / `"cancelled"`. Use `statusFilter(status)` from `src/utils/bookings.js` in queries so legacy capitalized rows (e.g. `"Pending"`) written before the fix remain visible. Use `isBookingStatus(value, expected)` for status comparisons.

**Service lifecycle**: created as `{ approved: false, status: "pending" }`; admin approves; vendor publishes (sets `status: "active"`). Free vendors capped at 3 active services; `PREMIUM_PLANS` bypass the cap.

## Key Utilities

| Module | Exports |
|---|---|
| `src/utils/services.js` | `toObjectId`, `findServiceById`, `activeServiceCount`, `isPremiumVendor`, `badRequest`, `notFound`, `forbidden`, `isBoundedString`, `isNonEmptyString`, `BOOKING_TEXT_LIMITS` |
| `src/utils/bookings.js` | `findBookingById`, `isBookingStatus`, `statusFilter`, `BOOKING_STATUSES` |
| `src/utils/imgbb.js` | `uploadImage`, `SUPPORTED_IMAGE_TYPES`, `MAX_FILE_SIZE`, `ImageUploadError` |
| `src/middleware/rateLimit.js` | `rateLimit`, `apiLimiter`, `bookingCreateLimiter`, `imageUploadLimiter`, `serviceWriteLimiter` |
| `src/middleware/upload.js` | `uploadSingleImage` (multer, field name `"image"`, memoryStorage, 10 MB limit) |

## Error Responses

All errors must be `{ error: { status: <number>, message: <string> } }`. Use helpers (`badRequest`, `notFound`, `forbidden`) from `src/utils/services.js` for 4xx. Pass unexpected errors via `next(err)` to `errorHandler`, which masks 5xx messages in production.

## Module System

ESM (`"type": "module"` in package.json). All relative imports require the `.js` extension. Node ≥ 18 required.

## Known Issues (must be aware of before touching these areas)

1. **Booking status casing**: Routes now write lowercase statuses; the schema validator and partial unique index on `"pending"` require lowercase. Use `statusFilter()` in all queries and `isBookingStatus()` for comparisons — both handle legacy capitalized rows.

2. **Route shadowing (`GET /api/bookings/vendor`)**: Fixed in `src/app.js` — `vendorBookingsRoutes` is registered before `bookingsRoutes`. Maintain this order.

3. **Image upload pipeline**: `multer` (`src/middleware/upload.js`) → `uploadSingleImage` middleware populates `req.file` with `{ buffer, mimetype }` (lowercase `mimetype`, not `mimeType`). The `uploadImage` function in `src/utils/imgbb.js` requires `IMGBB_API_KEY`.

4. **`STRIPE_*` env vars**: Present in `.env` but no code reads them yet — Stripe routes/handlers are unimplemented.
