# API Documentation — My Wedding Server

> Base URL: `http://localhost:8000`
> API Base: `http://localhost:8000/api`
> Authentication: Bearer JWT (issued by Better Auth on the Next.js frontend)

## Authentication

All protected routes require a valid Bearer token in the `Authorization` header.

### Header Format

```
Authorization: Bearer <jwt_token>
```

### Token Source

The JWT is issued by the Next.js frontend's Better Auth instance. The server
verifies tokens using the same `BETTER_AUTH_SECRET` and the same MongoDB
database.

### Public Routes

Some routes are public (no auth required):

- `GET /` — Server status
- `GET /api/services` — List services
- `GET /api/services/:id` — Service details

### Protected Routes

All other routes require a valid JWT. The token is verified via
`auth.api.verifyJWT({ body: { token, issuer: env.BETTER_AUTH_URL } })`.
On success, `req.user` is attached with the user document from the database.

### Token Rejection Reasons (401)

- No bearer token present
- Invalid signature or malformed token
- Token expired
- User not found in database
- User account is blocked (`isBlocked === true`)

---

## Endpoints

### Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | Returns server running text |
| `GET` | `/health` | No | Returns `{ ok: true, db: "mywedding" }` after pinging DB |

### Public Services

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/services` | No | List approved + active services with filtering, sorting, pagination |
| `GET` | `/api/services/:id` | No | Get details of a single service (approved + active only) |

### Customer Booking Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/bookings` | Yes | Create a booking request |
| `GET` | `/api/bookings` | Yes | Get own bookings |
| `GET` | `/api/bookings/:id` | Yes | Get booking details |
| `PATCH` | `/api/bookings/:id/cancel` | Yes | Cancel a pending booking |

### Vendor Booking Management Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/bookings/vendor` | Yes (vendor) | Get pending booking requests for own services |
| `PATCH` | `/api/bookings/:id/accept` | Yes (vendor) | Accept a pending booking |
| `PATCH` | `/api/bookings/:id/reject` | Yes (vendor) | Reject a pending booking |

### Profile Image Upload

| Method | Path | Auth | Description |
|---|---|---|---|
| `PATCH` | `/api/profile/image` | Yes | Upload profile image via ImgBB |

### Service Image Upload

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/services/:id/image` | Yes (vendor) | Upload service image via ImgBB |
| `GET` | `/api/services/:id/images` | Yes | Get all images for a service |

### Better Auth Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/me` | Yes | Get current user profile |
| `GET` | `/api/admin/users` | Yes (admin) | List all users |
| `GET` | `/api/admin/users/:userId` | Yes (admin) | Get user details |
| `POST` | `/api/admin/users/:userId/block` | Yes (admin) | Block a user |
| `POST` | `/api/admin/users/:userId/unblock` | Yes (admin) | Unblock a user |

---

### Endpoint Details

#### 1. Create Booking (`POST /api/bookings`)

**Auth**: Required (customer)

**Request body** (multipart/form-data or JSON):

| Field | Type | Required | Description |
|---|---|---|---|
| `serviceId` | string | Yes | The service ID (ObjectId string) |
| `eventDate` | string (ISO date) | Yes | The event date |
| `eventLocation` | string | No | Optional event location |
| `message` | string | No | Optional message to vendor |

**Response 201**:

```json
{
  "id": "objectid_string",
  "serviceId": "objectid_string",
  "vendorId": "vendor_user_id",
  "customerId": "customer_user_id",
  "eventDate": "2024-01-15T00:00:00.000Z",
  "eventLocation": "Optional location",
  "message": "Optional message",
  "status": "Pending",
  "createdAt": "2024-01-10T12:30:00.000Z"
}
```

**Error 400**: Service not approved/active, vendor is customer, duplicate booking, missing fields

**Error 403**: Admins cannot create customer bookings, vendors cannot book their own services

---

#### 2. Get Own Bookings (`GET /api/bookings`)

**Auth**: Required (customer)

**Response 200**:

```json
{
  "bookings": [
    {
      "id": "objectid_string",
      "serviceId": "objectid_string",
      "vendorId": "vendor_user_id",
      "customerId": "customer_user_id",
      "eventDate": "2024-01-15T00:00:00.000Z",
      "eventLocation": "",
      "message": "Some message",
      "status": "Pending",
      "createdAt": "2024-01-10T12:30:00.000Z"
    }
  ]
}
```

**Error 401**: No valid token

---

#### 3. Get Booking Details (`GET /api/bookings/:id`)

**Auth**: Required

**URL params**: `id` — booking ObjectId string

**Response 200**:

```json
{
  "id": "objectid_string",
  "serviceId": "objectid_string",
  "vendorId": "vendor_user_id",
  "customerId": "customer_user_id",
  "eventDate": "2024-01-15T00:00:00.000Z",
  "eventLocation": "",
  "message": "Optional message",
  "status": "Pending",
  "createdAt": "2024-01-10T12:30:00.000Z"
}
```

**Error 403**: User can only see their own bookings (`booking.customerId === req.user.id`)

**Error 404**: Booking not found

---

#### 4. Cancel Booking (`PATCH /api/bookings/:id/cancel`)

**Auth**: Required (owner)

**URL params**: `id` — booking ObjectId string

**Response 200**:

```json
{
  "id": "objectid_string",
  "status": "Cancelled",
  "updatedAt": "2024-01-12T14:20:00.000Z"
}
```

**Error 400**: Only pending bookings can be cancelled

**Error 403**: User can only cancel their own bookings

---

#### 5. Get Vendor Booking Requests (`GET /api/bookings/vendor`)

**Auth**: Required (vendor)

**Response 200**:

```json
{
  "bookings": [
    {
      "id": "objectid_string",
      "serviceId": "objectid_string",
      "customerId": "customer_user_id",
      "eventDate": "2024-01-15T00:00:00.000Z",
      "status": "Pending",
      "createdAt": "2024-01-10T12:30:00.000Z"
    }
  ]
}
```

**Error 401**: No valid token

---

#### 6. Accept Booking (`PATCH /api/bookings/:id/accept`)

**Auth**: Required (vendor), `requireVendor`

**URL params**: `id` — booking ObjectId string

**Response 200**:

```json
{
  "id": "objectid_string",
  "status": "Accepted",
  "updatedAt": "2024-01-12T14:25:00.000Z"
}
```

**Error 400**: Only pending requests can be accepted/rejected

**Error 403**: Vendor can only manage their own service bookings (`booking.vendorId === req.user.id`)

---

#### 7. Reject Booking (`PATCH /api/bookings/:id/reject`)

**Auth**: Required (vendor), `requireVendor`

**URL params**: `id` — booking ObjectId string

**Response 200**:

```json
{
  "id": "objectid_string",
  "status": "Rejected",
  "updatedAt": "2024-01-12T14:30:00.000Z"
}
```

**Error 400**: Only pending requests can be accepted/rejected

**Error 403**: Vendor can only manage their own service bookings

---

#### 7. Upload Profile Image (`PATCH /api/profile/image`)

**Auth**: Required (customer)

**Request**: `multipart/form-data` with file field named `image`

**Supported types**: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`

**Max size**: 10MB

**Response 200**:

```json
{
  "id": "user_id",
  "image": "https://i.imgbb.com/abc123.jpg",
  "name": "User name",
  "email": "user@example.com"
}
```

**Error 400**: Unsupported file type, file too large, no file provided

**Error 401**: No valid token

---

#### 8. Upload Service Image (`POST /api/services/:id/image`)

**Auth**: Required (vendor), `requireVendor`

**URL params**: `id` — service ObjectId string

**Request**: `multipart/form-data` with file field named `image`

**Response 200**:

```json
{
  "image": "https://i.imgbb.com/abc123.jpg",
  "service": {
    "id": "service_id",
    "serviceName": "Service name",
    "images": ["https://i.imgbb.com/abc123.jpg", "..."]
  }
}
```

**Error 403**: Vendor can only upload images for their own services

**Error 400**: Unsupported file type, file too large, no file provided

---

#### 9. Get Service Images (`GET /api/services/:id/images`)

**Auth**: Required (any)

**Response 200**:

```json
{
  "images": ["https://i.imgbb.com/abc123.jpg", "..."]
}
```

---

#### 10. Better Auth: Get Current User (`GET /api/auth/me`)

**Auth**: Required

**Response 200**:

```json
{
  "id": "user_id",
  "email": "user@example.com",
  "name": "User name",
  "role": "user",
  "isBlocked": false,
  "additionalFields": {
    "businessName": null,
    "subscriptionPlan": null,
    "subscriptionExpiresAt": null
  }
}
```

---

#### 11. Better Auth: Admin User Management

**Auth**: Required (admin), `requireAdmin`

**GET /api/admin/users**

**Response 200**:

```json
{
  "users": [
    {
      "id": "user_id",
      "email": "user@example.com",
      "name": "User name",
      "role": "user",
      "isBlocked": false
    }
  ],
  "total": 1
}
```

**Query params**: `search`, `role`, `limit`, `offset`, `sortBy`, `sortOrder`

**POST /api/admin/users/:userId/block**

**Request**: None (body not required)

**Response 200**:

```json
{
  "id": "user_id",
  "isBlocked": true
}
```

**POST /api/admin/users/:userId/unblock**

**Response 200**:

```json
{
  "id": "user_id",
  "isBlocked": false
}
```

---

#### 12. Service CRUD (Partial — vendor/admin only)

These routes are mounted in `src/app.js` but the full implementation
details are in `src/routes/vendorServices.js` and `src/routes/adminServices.js`.

**GET /api/admin/services** — List all services (filter, sort, paginate)

**POST /api/services** — Vendor creates a service (status: pending)

**PATCH /api/services/:id** — Vendor updates own service

**POST /api/services/:id/publish** — Publish after admin approval

**POST /api/admin/services/:id/approve** — Admin approves a service

### Error Response Format

All errors return JSON with `{ error: { status, message } }`:

```json
{
  "error": {
    "status": 400,
    "message": "Specific error message"
  }
}
```

HTTP status codes used:

- `400` — Bad request (validation, duplicate, etc.)
- `401` — Unauthorized (missing/invalid token)
- `403` — Forbidden (insufficient role, not owner)
- `404` — Not found
- `500` — Internal server error (hidden from client, logged server-side)

### Success Response Format

Successful JSON responses use consistent shapes per endpoint (see above).
5xx responses hide details from clients: `{"error":{"status":500,"message":"Internal server error"}}`.

### CORS Configuration

- `Origin`: `http://localhost:3000` (development) or configured `CLIENT_URL` (production)
- `Credentials`: `true` (cookies, authorization headers)
- `Wildcard "*"` is **never** used when `credentials: true` (invalid per spec)
- Misconfiguration in production fails fast if `CLIENT_URL` is not set

### Production Environment Checklist

- [ ] `BETTER_AUTH_SECRET` set to a strong, stable value (never regenerate per restart)
- [ ] `CLIENT_URL` set to the production frontend origin
- [ ] `MONGODB_URI` points to the production Atlas cluster
- [ ] `NODE_ENV=production`
- [ ] CORS `origin` set to production frontend URL (not `http://localhost:3000`)
- [ ] Stripe keys configured for production if payment features are active
- [ ] IMGBB API key configured if image upload is active
- [ ] Health check endpoint (`/health`) available for load balancer monitoring
- [ ] Graceful shutdown via SIGTERM/SIGINT handlers in `index.js`

### Security Audit Checklist

- [ ] No `process.env` accessed directly outside `src/config/env.js`
- [ ] `BETTER_AUTH_SECRET` matches between server and frontend `.env` files
- [ ] CORS origin is never `"*"` when `credentials: true`
- [ ] All protected routes have `authenticate` middleware mounted
- [ ] `requireVendor`/`requireAdmin` used for vendor/admin routes
- [ ] User identity derived from `req.user.id` (JWT-verified), never from client input
- [ ] Blocked users (`isBlocked === true`) rejected with 401
- [ ] Role-based authorization uses `canAccess(userRole, requiredRole)` hierarchy
- [ ] Express `json()` body parser mounted before routes that read `req.body`
- [ ] Error handler is the last middleware (`app.use(errorHandler)`)
- [ ] IMGBB `API_KEY` only used in `src/utils/imgbb.js`, never sent to browser
- [ ] Duplicate booking prevention via unique partial index on `(serviceId, customerId, status: "pending")`
- [ ] Stripe webhook signature verification implemented
- [ ] No sensitive credentials in source code or commit history
- [ ] Proper HTTP status codes on all responses
- [ ] Production `NODE_ENV` configuration verified