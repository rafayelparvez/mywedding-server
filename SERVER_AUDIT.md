# SERVER_AUDIT.md — MyWedding Express.js Server

Audit of `mywedding-server/` (server) against the MyWedding wedding-planning marketplace
assignment, whose frontend context is `mywedding/` (Next.js 16 App Router, better-auth, MongoDB).

All findings are based on the files read:
- Server: `mywedding-server/index.js`, `package.json`, `package-lock.json`, `.env`, `node_modules/express/package.json` (5.3.0), `node_modules/mongodb/package.json` (7.9.1).
- Frontend (requirement source): `mywedding/README.md`, `mywedding/AGENTS.md`, `mywedding/package.json`, `mywedding/.env`, `mywedding/src/lib/auth.ts`, `mywedding/src/lib/roles.ts`, `mywedding/src/lib/auth-client.ts`, `mywedding/src/app/api/auth/[...all]/route.ts`.

Paths below are relative to the repo root.

---

## 1. Existing project structure

`mywedding-server/` is a **flat, single-entry project**:

| File | Role |
|---|---|
| `index.js` | Entry point (~13 lines) |
| `package.json` | Name `mywedding-server` v1.0.0, `"type": "module"`; deps: `cors`, `dotenv`, `express`, `mongodb`; only a broken `test` stub script |
| `package-lock.json` | Lockfile |
| `.env` | PORT, NODE_ENV, MONGODB_URI, CLIENT_URL, BETTER_AUTH_URL, STRIPE_*, IMGBB_API_KEY |
| `node_modules/` | Installed deps (Express 5.3.0, MongoDB driver 7.9.1, …) |

Not present: `src/` tree, README, tests, CI config, `AGENTS.md`, `.gitignore`, worktrees.

## 2. Express configuration

- Installed: **Express 5.3.0** (`node_modules/express/package.json`; `package.json` allows `^5.3.0`).
- Current setup (`index.js`): `const app = express()`, `port = process.env.PORT || 8000`, one route
  `app.get('/', ...)` returning the text `Server is running fine`, then `app.listen(port, ...)`.
- Status: **Partially Completed**.
- Needs Fixing:
  - No body parsing configured. Express 5.3.0 does export `express.json()` etc.
    (verified: `exports.json = bodyParser.json` in `node_modules/express/lib/express.js`) — it just isn't used.
  - No CORS, no logger, no centralized error middleware, no trust proxy, no graceful shutdown,
    no security `app.set` defaults.
  - `cors` dependency is declared but never imported (unused, see §11).

## 3. MongoDB connection

- Status: **Missing**.
- There is **no connection code** anywhere in the server: `MongoClient` is never constructed, no
  `db()` selection, no ping, no error handling.
- The `mongodb` driver 7.9.1 is installed and `.env` provides a working Atlas URI
  (`mongodb://mywedding:***@ac-chqzybd-shard-00-00.9kggoyj.mongodb.net:27017,…`, same cluster as the
  frontend's `BETTER_AUTH_DB_URI`), but `index.js` never reads it.

## 4. Existing routes

- Only **`GET /`** → plain text `Server is running fine` (200). No API routes exist.

## 5. Controllers

- Status: **Missing**. All route logic is the inline callback in `index.js`.

## 6. Middleware

- Status: **Missing**. None configured: no `express.json()`, no CORS, no logger, no auth middleware,
  no error handler, no request logger.

## 7. Models and database collections

- Status: **Missing** — no domain models, no domain collections. Currently zero app collections.
- The constraint "don't duplicate Better Auth collections / create unnecessary collections" is trivially
  satisfied now; the plan (§14) keeps it satisfied — see the Better Auth section.

## 8. Better Auth integration

- Status: **Missing in the server. Completed in the frontend.**
- Frontend (reference implementation of the assignment's auth):
  - `mywedding/src/lib/auth.ts`: `betterAuth({ emailAndPassword: { enabled: true, minPasswordLength: 8,
    maxPasswordLength: 128 }, …(google ? { socialProviders: { google: … } } : {}), database:
    mongodbAdapter(client.db("mywedding"), { client }), user: { additionalFields: { role: {…},
    requestedRole: {…} } }, databaseHooks: { user: { create: { before: …map requestedRole… } } } })`.
  - Google sign-in disabled unless both `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set
    (frontend `.env` has them empty → email/password only today).
  - Catch-all route `mywedding/src/app/api/auth/[...all]/route.ts` uses
    `toNextJsHandler(auth)`; client helpers in `mywedding/src/lib/auth-client.ts`
    (`authClient`, `signIn`, `signUp`, `signOut`, `useSession`).
  - Roles: `user`, `vendor`, `admin` (`mywedding/src/lib/roles.ts`); public registration can only create
    `user`/`vendor`; admins must be promoted directly in MongoDB.
- Server plan (§14): mount Better Auth on the server at `/api/auth/*` via `toNodeHandler` from
  `better-auth/node`, using the same `mywedding` DB name as the frontend, so both share the same
  Better Auth collections — no duplicates.

## 9. JWT implementation

- Status: **Missing** in the server and unused by the frontend.
- Better Auth 1.7.15 ships `bearer` and `jwt` plugins (see `better-auth/dist/plugins/jwt`, `bearer`),
  but the frontend uses Better Auth's default session cookies.
- Plan: **no custom JWT**. If API tokens are ever needed, enable Better Auth's built-in
  `jwt`/`bearer` plugins rather than rolling our own.

## 10. Environment configuration

Server `.env` (all keys):

```
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb://mywedding:***@ac-chqzybd-shard-00-00.9kggoyj.mongodb.net:27017,…
CLIENT_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
IMGBB_API_KEY=your_imgbb_api_key
```

Issues / needs fixing:

1. `dotenv` is a declared dependency but **`index.js` never imports it** — `.env` is not loaded at
   runtime. `PORT=8000` only "works" because of the `process.env.PORT || 8000` fallback; every other
   key is undefined at runtime.
2. No `BETTER_AUTH_SECRET` in the server `.env` (the frontend `.env` has one). Better Auth needs it, or
   it generates a fresh one per process, invalidating sessions on restart.
3. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `IMGBB_API_KEY` are **placeholder values**; no Stripe
   or IMGBB code exists in the server or in the frontend `src/` (grep-verified).
4. `CLIENT_URL` is unused by server code today.

## 11. Installed dependencies

`mywedding-server/package.json`:

- `cors ^2.8.6` — installed, **unused** (no `app.use(cors())`).
- `dotenv ^18.0.10` — installed, **unused** (no `import "dotenv/config"`).
- `express ^5.3.0` — installed **5.3.0**, used.
- `mongodb ^7.9.1` — installed **7.9.1**, unused (no connection code).

Missing from the server (needed by the plan, §14): `better-auth ^1.7.15` and
`@better-auth/mongo-adapter ^1.7.15` (peer `mongodb ^6/^7` is satisfied by 7.9.1).

Scripts: `test` is a stub (`echo "Error: no test specified" && exit 1`); there are no `start`, `dev`,
`lint`, or `typecheck` scripts.

## 12. Comparison with the MyWedding assignment requirements

Requirements (from the frontend context, `mywedding/`): wedding-planning marketplace app
(Banner/Header/Footer on the homepage); email/password auth via Better Auth on `/login`, `/register`
with roles `user`/`vendor`/`admin`; MongoDB backend; frontend consumes the server API at
`http://localhost:8000` (`NEXT_PUBLIC_API_URL`); server on port 8000 (`PORT=8000`).

| Requirement | Server state | Classification |
|---|---|---|
| Project structure | Flat, minimal; no src/ tree, no README | Completed |
| MongoDB connection | No connection code; URI configured but unused | **Missing** |
| Express configuration | `express()` + port + `GET /`; no body parsing/CORS/error handling | Partially Completed (needs fixing) |
| Existing routes | Only `GET /` | Partially Completed |
| Controllers | None | **Missing** |
| Middleware | None | **Missing** |
| Models & collections | None (no domain models, no auth collections) | **Missing** |
| Better Auth integration | Not present in server (frontend serves it at :3000/api/auth itself) | **Missing** (server side) |
| JWT implementation | None (not required: Better Auth sessions) | **Missing** (not required; plan: none) |
| Marketplace domain endpoints (vendors, bookings, search, …) | None | **Missing** (no code found in server or frontend src) |
| Stripe payments + IMGBB image upload | Placeholder env keys only; no implementation anywhere | **Missing** (placeholders) |
| Health endpoint | `GET /` returns plain text | Partially Completed (add `GET /health` in plan) |
| Scripts (`start`/`dev`/`test`) | `test` is a broken stub; no `start`/`dev` | Needs Fixing |
| Env loading | `.env` not loaded (dotenv unused) | Needs Fixing |

## 13. Planned clean and maintainable backend architecture

### Target layout

```
mywedding-server/
├── index.js                     # entry: env → db connect → app → listen (+ graceful shutdown)
├── src/
│   ├── config/
│   │   ├── env.js               # import "dotenv/config"; validate required env vars
│   │   └── db.js                # MongoClient(MONGODB_URI), db = client.db("mywedding"), connect+ping, close
│   ├── app.js                   # express app factory: logger, cors, express.json, errorHandler, mountRoutes
│   ├── auth.js                  # Better Auth instance (email/password + Google, roles via databaseHooks)
│   ├── routes/
│   │   ├── index.js             # mount: health + auth (+ domain routers later)
│   │   ├── health.js            # GET / (existing), GET /health → { ok: true, db: "mywedding" }
│   │   └── auth.js              # app.all("/api/auth/*", toNodeHandler(auth))
│   ├── controllers/             # future marketplace handlers (vendors, bookings, …)
│   ├── models/                  # future domain repositories — NO auth collections here
│   ├── middleware/
│   │   ├── errorHandler.js      # centralized error → JSON responses
│   │   └── logger.js            # minimal request logger (timestamp, method, url, status)
│   └── utils/                   # small shared helpers as needed
├── .env
└── package.json
```

### MongoDB plan

- One shared client in `src/config/db.js`: `client = new MongoClient(env.MONGODB_URI)`,
  `db = client.db("mywedding")` — same DB name the frontend uses (`client.db("mywedding")` in
  `mywedding/src/lib/auth.ts`) on the same Atlas cluster, so server and frontend share one data set.
- `await client.connect()` + `await db.admin().ping()` at startup (fail fast on bad URI).
- Graceful shutdown: `client.close()` on SIGTERM/SIGINT.
- No migrations: Better Auth auto-creates its collections; domain collections are created by
  `src/models/*` when marketplace features land.

### Better Auth plan — no duplicated collections, no unnecessary collections

- `src/auth.js` mirrors the frontend semantics (values `user`/`vendor`/`admin`; registration allows
  `user`/`vendor`; default role `user`; `requestedRole` is the input-only field; `databaseHooks` maps it).
  The frontend keeps its own copy in `mywedding/src/lib/auth.ts` + `src/lib/roles.ts`; the server defines
  its local copies since the packages don't share source.
- `database: mongodbAdapter(db, { client })`.
- Mount via `app.all("/api/auth/*", toNodeHandler(auth))` from `better-auth/node`.
- Collections: **Better Auth owns its own collections** (users, sessions, accounts, verification
  tokens). The server adds **no auth collections of its own**; `src/models/` starts with zero auth
  models and only gains domain collections when features are added.
- Env: add `BETTER_AUTH_SECRET` to server `.env`; set Better Auth `baseURL` to the server origin
  (`http://localhost:8000`) since the server hosts auth — or point the frontend client at the server
  via `createAuthClient({ baseURL, … })` (frontend change, out of scope for the server audit).

### Routes / middleware / controllers plan

- `app.use(cors())` — the frontend calls the server cross-origin (frontend :3000 → server :8000).
- `app.use(express.json())` — Express 5.3.0 supports it; needed for future POST/PUT/PATCH endpoints.
- `app.use(errorHandler)` — centralized JSON error responses; also unhandled-rejection logging.
- `app.use(logger)` — request logger.
- Health: keep `GET /` (existing text response) and add `GET /health` (JSON `{ ok: true, db: "mywedding" }`;
  extend with a `db.admin().ping()` when needed).
- Domain: mount domain routers under `/api/...` when marketplace features land; handlers in
  `src/controllers`, repos in `src/models`.

### Scripts plan

```json
"scripts": {
  "start": "node index.js",
  "dev": "node --watch index.js",
  "test": "node --test test/"
}
```

(Node ≥ 18 per Express 5.3's engines; replace the stub `test` with real tests under `test/` as features land.)

### Env plan

- `BETTER_AUTH_SECRET`: add to `.env` (generate a strong secret).
- Stripe/IMGBB keys: add real values when those features are implemented; until then they're inert
  placeholders — leave them or delete; no server code reads them yet.

## 14. Suggested implementation order (files intentionally NOT modified in this audit)

1. `package.json` — add `better-auth ^1.7.15`, `@better-auth/mongo-adapter ^1.7.15`; new scripts (`start`, `dev`, `test`).
2. `.env` — add `BETTER_AUTH_SECRET`.
3. `src/config/env.js` — `import "dotenv/config"` + required-var validation (`MONGODB_URI`, `BETTER_AUTH_SECRET`).
4. `src/config/db.js` — shared MongoClient + `db("mywedding")` + connect/ping/close.
5. `src/auth.js` — Better Auth instance (email/password + Google, roles, `databaseHooks`).
6. `src/app.js` + `src/routes/*` — logger/cors/express.json/errorHandler; health routes; `app.all("/api/auth/*", toNodeHandler(auth))`.
7. `index.js` — entry: `connect()` → `createApp()` → `app.listen(PORT)` + SIGTERM/SIGINT graceful close.
8. `src/middleware/errorHandler.js`, `src/middleware/logger.js`.
9. Later: `src/models/*`, `src/controllers/*` for the first marketplace feature; tests.

## 15. Audit hygiene

- Existing files were **not modified** in producing this audit.
- Summary: the server is currently a stub around `express()` with no DB, no auth, no routes, no
  middleware, no models/collections, no JWT, and a non-loaded `.env`. The plan rebuilds it as a small
  layered Express app (config → db → auth → routes/controllers/models → middleware → server entry),
  hosting Better Auth itself with zero duplicated auth collections.
