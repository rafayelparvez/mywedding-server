# AGENTS.md — My Wedding Server

Express 5 + MongoDB API for the MyWedding marketplace. It shares the frontend's
`mywedding` database and **only verifies** JWTs issued by the Next.js Better Auth
instance — it never issues logins, sessions, or passwords.

## Commands

| Command | What it does |
|---|---|
| `npm start` | `node index.js` |
| `npm run dev` | `node --watch index.js` |
| `npm test` | Stub: prints an error and exits 1. No test framework, no `test/` dir. |

- npm only (`package-lock.json`) — no pnpm/yarn. No lint, format, typecheck, build, or CI config.
- ESM (`"type": "module"`): relative imports must include the `.js` extension.
- Node ≥ 18 required (global `fetch`, `node --watch`, Express 5).
- No README; `API_DOCUMENTATION.md` and `SERVER_AUDIT.md` are partly stale (see Known Issues).

## Setup

- Copy `.env.example` → `.env`. Startup fails fast if Atlas is unreachable (`db.admin().ping()` in `connect()`), so there is no offline/dev-without-DB mode.
- Validated in `src/config/env.js`: `MONGODB_URI` and `BETTER_AUTH_SECRET` required; `PORT` (8000, 1–65535); `NODE_ENV`; `CLIENT_URL` (required only when `NODE_ENV=production`); `BETTER_AUTH_URL` (defaults to `http://localhost:3000`, also used as the JWT `issuer`).
- `BETTER_AUTH_SECRET` and the DB name `mywedding` (hardcoded in `src/config/db.js`) must match the frontend's setup, or every protected request 401s.
- `IMGBB_API_KEY` is read raw via `process.env` in `src/utils/imgbb.js`; it is **not** in `.env.example` and **not** validated by `env.js`. `STRIPE_*` values exist in `.env` but no code reads them yet.

## Architecture

- Boot order in `index.js`: `createApp()` → `connect()` → `ensureCollections()` → `ensureIndexes()` → `listen(PORT)`. Startup errors exit 1; SIGTERM/SIGINT close the Mongo client.
- Layered app: config → db → auth → middleware → routes. `src/app.js` owns wiring; keep route logic out of `index.js`/`app.js`.
- Middleware order in `src/app.js` matters: `cors({ origin: env.CLIENT_URL, credentials: true })` → `express.json()` → health routes → public service routes → `app.use('/api', authenticate)` → route modules → 404 → `errorHandler`.
- Public routes are public **because they are registered before** the `/api` authenticate mount. New public endpoints must go there; anything after is authenticated.

### Key modules

| Path | Purpose |
|---|---|
| `src/config/env.js` | Only place that loads dotenv and validates env |
| `src/config/db.js` | Shared `MongoClient` + `db = client.db("mywedding")`, `connect()`, `close()` |
| `src/auth/index.js` | Better Auth instance (exported as `auth`, not `betterAuth`) + async `authAdapter()` |
| `src/auth/roles.js` | `USER_ROLES`, `ROLE_HIERARCHY`, `canAccess`, `roleLevel` |
| `src/middleware/authenticate.js` | Bearer extraction, `auth.api.verifyJWT`, DB lookup, blocked check, sets `req.user` |
| `src/middleware/authorize.js` | `requireUser` / `requireVendor` / `requireAdmin` / `requireRole`, `isOwner`, `requireOwn` |
| `src/db/collections.js` | `services`, `bookings`, `transactions` handles, validators, indexes |
| `src/utils/services.js` | Validators, `findServiceById`, `activeServiceCount`, `isPremiumVendor`, response helpers |
| `src/utils/imgbb.js` | ImgBB upload + profile-image middleware (expects `req.file`) |

### Auth & identity

- `authenticate` verifies `Bearer <token>` with `auth.api.verifyJWT({ body: { token, issuer: env.BETTER_AUTH_URL } })`, loads the user through the adapter, and rejects missing/invalid/expired tokens, unknown users, and `isBlocked === true`.
- `authorize.js` exports `requireAuth` (alias of `authenticate`) but **not** `authenticate`; import `authenticate` from `src/middleware/authenticate.js`.
- Hierarchy is `user < vendor < admin`; unknown or missing roles get level 0.
- `authAdapter()` is async and its `where` is always an array: `[{ field: "id", value }]`. `findMany` supports `operator: "contains", mode: "insensitive"` (see `adminUsers.js`).
- Better Auth fields `role`, `isBlocked`, and subscription fields are declared `input: false` — the auth API cannot change them. Admin blocking works by calling `adapter.update` directly.
- `/api` is already authenticated, so handlers should not re-add `authenticate`. `bookings.js`, `vendorBookings.js`, and `serviceImages.js` do, which just verifies the JWT twice.
- Derive identity only from `req.user.id`. Never accept `customerId`, `vendorId`, or `role` from a request body.
- `PATCH /api/profile` whitelists only `name` (any other field → 400). The image route expects `req.body.image` to be set by the ImgBB middleware.

## Data model

- Collections: `services`, `bookings`, `transactions`, created with `$jsonSchema` validators. Users/sessions/accounts belong to Better Auth — do not create auth collections.
- `ensureCollections()` / `ensureIndexes()` are idempotent and run on every boot.
- Validators only apply when a collection is first created. `createCollection` returns `NamespaceExists` on later boots and **ignores changed schemas**, so editing `src/db/collections.js` does not update an existing DB — use `collMod` (or drop the collection).
- Mixed id types: `services.vendorId`, `bookings.vendorId`, `bookings.customerId` are Better Auth **string** ids; `services._id` and `bookings.serviceId` are **ObjectId**. Convert with `new ObjectId(...)` inside try/catch and return 400/404 rather than throwing.
- A partial unique index on `(serviceId, customerId, status: "pending")` enforces one pending booking per service/customer.
- Service lifecycle: created as `approved: false, status: "pending"`; `PATCH /api/services/:id` rejects `status`/`approved` changes; publish requires prior admin approval; free vendors are capped at 3 active services (`PREMIUM_PLANS` bypass the cap).

## Routes

Public (before auth mount): `GET /` (JSON message), `GET /health` (pings DB → 200/503), `GET /api/services` (default limit 50, max 100), `GET /api/services/:id` (approved + active only).

| Area | Endpoints | Access |
|---|---|---|
| Profile | `GET /api/me` (id/email/name/emailVerified), `GET/PATCH /api/profile`, `PATCH /api/profile/image` | any auth |
| Vendor services | `POST /api/services`, `GET /api/vendor/services`, `PATCH/DELETE /api/services/:id`, `POST /api/services/:id/publish`, `.../unpublish`, `POST /api/services/:id/image` | vendor, owner |
| Service images | `GET /api/services/:id/images` | any auth |
| Customer bookings | `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/:id`, `PATCH /api/bookings/:id/cancel` | any auth, own records |
| Vendor bookings | `GET /api/bookings/vendor`, `PATCH /api/bookings/:id/accept`, `.../reject` | vendor, own services |
| Admin services | `GET /api/admin/services`, `POST .../:id/approve`, `.../reject`, `PATCH .../:id/status`, `DELETE .../:id` | admin |
| Admin users | `GET /api/admin/users`, `GET .../:userId`, `POST .../block`, `.../unblock` | admin |

Errors are always `{ error: { status, message } }`; 5xx messages are masked. Use the helpers in `src/utils/services.js` and pass unexpected failures to `next(err)`.

## Known issues (verify/fix before building on these)

1. **Booking status casing is inconsistent.** Routes write `"Pending"` / `"Accepted"` / `"Rejected"` / `"Cancelled"`, but the schema enum allows only `"pending"` / `"confirmed"` / `"cancelled"`. On a DB created with validators, booking inserts and status updates fail validation — and the partial index on `"pending"` never matches. Align casing end-to-end if you touch bookings.
2. **`GET /api/bookings/vendor` is shadowed** by `GET /api/bookings/:id`, which is registered earlier, so it treats `"vendor"` as an id and returns 400 "Invalid booking ID". Reorder/rename to expose it.
3. **Image uploads are not wired.** No multer/busboy/multipart parser exists in dependencies or `app.js`, so `req.file` is never populated (and the code reads `req.file.mimeType`, while multer uses `mimetype`). Upload endpoints return 400 / never upload. Adding a parser plus the `mimetype` fix and `IMGBB_API_KEY` is required before they work.
4. **Docs drift.** `API_DOCUMENTATION.md` documents intended multipart behavior and booking responses the code does not produce; `SERVER_AUDIT.md` is a planning snapshot. Treat `src/routes/*.js` as the source of truth.
