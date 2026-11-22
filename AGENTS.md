# AGENTS.md — My Wedding Server

> Compact instruction file to help future OpenCode sessions avoid mistakes and ramp up quickly.

## Commands

| Command | Description |
|---|---|
| `pnpm start` | Start the server (node index.js) |
| `pnpm dev` | Start the server with auto-reload (node --watch index.js) |
| `pnpm test` | Run tests (currently a stub; real tests under `test/` when added) |

> **Note:** `start` and `dev` scripts are defined in `package.json`. The `test` script is currently a stub that exits with an error — real tests will be added under `test/` as features land.

## Environment

The `.env` file is gitignored. Copy `.env.example` to `.env` and fill in real values.

### Required environment variables (validated in `src/config/env.js`):

- `MONGODB_URI` — Atlas MongoDB connection string. The server connects to the `mywedding` database, which must match the frontend's `BETTER_AUTH_DB_URI`.
- `BETTER_AUTH_SECRET` — **must match** the frontend's `mywedding/.env` secret. Better Auth generates a fresh one per process by default, which invalidates sessions on restart.
- `PORT` — defaults to `8000`; must be an integer in range 1–65535.
- `NODE_ENV` — defaults to `"development"`. In `"production"`, `CLIENT_URL` becomes required.
- `CLIENT_URL` — origin of the Next.js frontend. Used for CORS. Required when `NODE_ENV=production`.
- `BETTER_AUTH_URL` — defaults to `"http://localhost:3000"`. Must match the server origin (the frontend's `BETTER_AUTH_BASE_URL`).

> **Do not** rely on `process.env` directly without going through `src/config/env.js`. All required vars are validated there; accessing them raw may cause runtime failures (e.g., `BETTER_AUTH_SECRET` being `undefined`).

## Architecture

This is a **layered Express app** (server entry → config → db → auth → routes → middleware → listen). Do not skip layers or add route logic directly in `index.js`.

### Key directories

| Directory | Purpose |
|---|---|
| `src/config/env.js` | Environment variable validation + `dotenv/config` loading |
| `src/config/db.js` | Shared `MongoClient` + `db = client.db("mywedding")` — same DB name as the frontend |
| `src/auth/index.js` | Better Auth instance (`betterAuth`) with jwt plugin + mongodbAdapter. **Never** issue passwords/logins on the server; it only verifies tokens from the frontend. |
| `src/auth/roles.js` | Role hierarchy: `user < vendor < admin`. Exported as `USER_ROLES`, `ROLE_HIERARCHY`, `DEFAULT_USER_ROLE`, `REGISTRATION_ROLES`. |
| `src/middleware/authenticate.js` | Extracts bearer token, verifies it via `auth.api.verifyJWT()`, loads `req.user` from DB. Rejects with 401 on missing/invalid/expired tokens or blocked users. |
| `src/middleware/authorize.js` | Role-based authorization: `requireUser`, `requireVendor`, `requireAdmin`, `requireRole(r)`, `isOwner`, `requireOwn`. |
| `src/middleware/errorHandler.js` | Centralized error handler — responds with consistent JSON `{ error: { status, message } }`. Logs 5xx to console. |
| `src/routes/` | Express routes mounted under `/api/` prefix (see `src/app.js`). |
| `src/db/collections.js` | MongoDB collection handles: `services`, `bookings`, `transactions`. Also `ensureCollections()` and `ensureIndexes()` (idempotent). |
| `src/utils/services.js` | Shared validators/helpers: `isNonEmptyString`, `isNonNegativeNumber`, `isPremiumVendor`, `findServiceById`, `activeServiceCount`, `getUserById`, `badRequest`, `notFound`, `forbidden`. |
| `src/utils/imgbb.js` | Server-side ImgBB image upload utility with type/size validation. Uses built-in `fetch` (no `node-fetch` dependency). |
| `src/app.js` | Express app factory: cors, json body parser, health/routes, authenticate middleware, route mounts, 404 handler, error handler. |

### Execution flow (request lifecycle)

1. `index.js` → `connect()` → `createApp()` → `app.listen(PORT)` + SIGTERM/SIGINT handlers
2. `createApp()` mounts: cors, express.json, health routes, then `/api` protected by `authenticate`
3. `authenticate` extracts bearer token → `auth.api.verifyJWT()` → `adapter.findOne({model:"user", ...})` → attaches `req.user`
4. Protected routes also mount `requireVendor`/`requireAdmin` as needed
5. `errorHandler` is the last middleware, catches all thrown errors + 404s

## MongoDB

- The shared client is in `src/config/db.js`: `client = new MongoClient(env.MONGODB_URI)`, `db = client.db("mywedding")`.
- **Connect on startup**: `await connect()` in `index.js` — fails fast if the cluster is unreachable (`db.admin().ping()`).
- **Graceful shutdown**: `client.close()` on SIGTERM/SIGINT (see `index.js` shutdown function).
- **Collections**: `ensureCollections()` creates `services`, `bookings`, `transactions` with JSON-schema validators. Idempotent — safe to call on every restart.
- **Indexes**: `ensureIndexes()` creates common query indexes. Idempotent.
- **No migrations**: Better Auth auto-creates its own collections (users, sessions, accounts, verification tokens). The server adds **no auth collections of its own**. Domain collections start empty and only gain validation/indexes as features land.

## Better Auth

- The server hosts its own Better Auth instance (`src/auth/index.js`) solely for **verifying** tokens issued by the Next.js frontend. It does **not** issue passwords, logins, or sessions itself.
- `baseURL: env.BETTER_AUTH_URL` — must match the frontend's Better Auth base URL so the server can verify the frontend's JWTs with the same signing keys.
- `secret: env.BETTER_AUTH_SECRET` — **must be identical** to the frontend's `.env`. Without a shared secret, token verification fails.
- `emailAndPassword: { enabled: false }` — the frontend handles all auth issuance. The server only verifies.
- `plugins: [jwt()]` — enables Better Auth's built-in JWT/bearer plugins. Do not roll custom JWT logic.
- Collections owned by Better Auth: `users`, `sessions`, `accounts`, `verification_tokens`. The server adds **zero** auth collections — domain collections (`services`, `bookings`, `transactions`) are separate.
- `authAdapter()` (exported from `src/auth/index.js`) resolves the Better Auth adapter for DB operations (`adapter.findOne`, `adapter.update`, `adapter.findMany`, `adapter.count`, `adapter.update{isBlocked}`). Used by all middleware.

### Env setup for Better Auth

1. Add `BETTER_AUTH_SECRET` to `.env` — generate a strong secret (e.g., `openssl rand -hex 32`).
2. Set `BETTER_AUTH_URL` to the server origin (e.g., `"http://localhost:8000"`) if the frontend needs to contact the server directly for auth. Currently the frontend is configured at `:3000`, but the server's `baseURL` should reflect its own port.

## Routes & API

All public API routes are under `/api/`. The prefix is mounted in `src/app.js` via `app.use('/api', authenticate)`, so every protected route automatically requires authentication.

### Public routes (no auth required)

- `GET /` — text `"Server is running fine"` (also `GET /health` JSON status)
- `GET /api/services` — list approved + active services (with filtering, sorting, pagination)
- `GET /api/services/:id` — details of a single service (approved + active only)

### Protected routes (require valid bearer JWT)

- `GET /api/me` — current user profile
- `GET /api/profile` — current user profile (read)
- `PATCH /api/profile` — update name
- `PATCH /api/profile/image` — update profile image (via ImgBB)
- `POST /api/services` — vendor creates a service (status: pending by default)
- `GET /api/vendor/services` — vendor lists own services
- `PATCH /api/services/:id` — vendor updates own service (status locked; publish via `/publish`)
- `POST /api/services/:id/publish` — vendor publishes a service (admin approval required, 3-active limit for free vendors)
- `POST /api/services/:id/unpublish` — vendor unpublishes a service
- `GET /api/admin/services` — admin lists all services (filter, sort, paginate)
- `POST /api/admin/services/:id/approve` — admin approves a service
- `POST /api/admin/services/:id/reject` — admin rejects a service
- `PATCH /api/admin/services/:id/status` — admin changes service status (active/inactive; requires approval first)
- `GET /api/admin/users` — admin lists users (search by name/email, filter by role, paginate)
- `GET /api/admin/users/:userId` — admin gets user details
- `POST /api/admin/users/:userId/block` — admin blocks a user
- `POST /api/admin/users/:userId/unblock` — admin unblocks a user

### Role requirements

- `requireUser` — any authenticated user with a known role
- `requireVendor` — vendor or admin
- `requireAdmin` — admin only
- `requireRole(r)` — role with access >= r (hierarchy: user=1, vendor=2, admin=3)

## Middleware Order Matters

The order of middleware in `src/app.js` is significant and should not be changed lightly:

1. `app.use(cors({ origin: env.CLIENT_URL, credentials: true }))` — CORS must be first so creden‑tials work
2. `app.use(express.json())` — body parsing for POST/PATCH bodies
3. `healthRoutes(app)` — `GET /` and `GET /health`
4. `app.use('/api', authenticate)` — **protects all /api routes** (extracts/verifies JWT, attaches `req.user`)
5. Domain route mounts: `profileRoutes`, `vendorServicesRoutes`, `adminServicesRoutes`, `adminUsersRoutes`, `meRoutes`
6. 404 handler (unmatched methods/URLs → JSON error)
7. `app.use(errorHandler)` — centralized error responses (must be last)

## Things That Will Trip Up an Unprepared Agent

| Gotcha | Why it matters | Fix / mitigation |
|---|---|---|
| `.env` not loaded | `dotenv` is a dependency but `src/config/env.js` is the only entry point that imports `import "dotenv/config"` — if you access `process.env` vars raw outside `env.js`, they may be undefined. | Always go through `src/config/env.js`; the env object is exported and used everywhere. |
| `BETTER_AUTH_SECRET` mismatch | If the server's secret differs from the frontend's, ALL token verification fails → 401 on every protected request. | Generate once, copy to both `.env` files. Never regenerate without also updating the frontend. |
| CORS with `credentials: true` | `origin: "*"` is invalid when `credentials: true`. The CORS origin is pinned to `CLIENT_URL`; misconfiguration fails fast in production. | In production, `CLIENT_URL` must be a concrete origin (not `http://localhost:3000` if deployed elsewhere). |
| `MONGODB_URI` missing | The server will throw `Missing required environment variable: MONGODB_URI` on startup. | Ensure `.env` is copied from `.env.example` and filled before running. |
| Role hierarchy confusion | `USER_ROLES = ["user", "vendor", "admin"]` but access is hierarchical: `user < vendor < admin`. `canAccess(userRole, requiredRole)` returns true when the user's level >= required level. | Use `requireUser`, `requireVendor`, `requireAdmin` helpers rather than comparing levels manually. |
| `authAdapter()` is async | `authAdapter()` resolves the Better Auth adapter via `auth.$context`. It must be `await`ed before calling `adapter.findOne`, `adapter.update`, etc. | All route handlers already `await authAdapter()` — follow the same pattern. |
| `express.json()` must precede body parsing | If you add routes that read `req.body`, `express.json()` must be mounted before them. It is in `src/app.js` line 22, but adders of new routes must respect this. | New route handlers must not assume `req.body` is populated without `express.json()` being active. |
| `node-fetch` not installed | `src/utils/imgbb.js` uses the built-in `fetch` — do not import from `node-fetch` unless added to `package.json`. | The file was fixed to use the global `fetch`; no external dependency needed. |
| Import `authenticate` from wrong module | `import { authenticate } from '../middleware/authorize.js'` fails because `authorize.js` only exports `requireAuth`. Import from `../middleware/authenticate.js` instead. | Follow the import pattern in `src/routes/bookings.js` (import from `authenticate.js`) and `src/routes/vendorBookings.js` (import `authenticate` from `authenticate.js`, `requireVendor` from `authorize.js`). |
| Graceful shutdown not triggered in all paths | `process.once("SIGTERM", ...)` and `process.once("SIGINT", ...)` are set in `index.js`. If the process is killed with `SIGKILL`, handlers won't run. | For production, prefer graceful signals (stop/start) over `kill -9`. |
| imgbb API key missing | `IMGBB_API_KEY` must be set in `.env`; the utility throws if it's undefined. | Add `IMGBB_API_KEY=your_key_here` to `.env` (the file already has a placeholder key). |