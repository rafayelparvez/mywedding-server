// Role-based authorization middleware tests — standalone demo app on :8899.
import express from 'express';
import { ObjectId } from 'mongodb';

import { db } from './src/config/db.js';
import { auth } from './src/auth/index.js';
import { authenticate } from './src/middleware/authenticate.js';
import { requireRole, requireAdmin, requireVendor, requireUser, requireOwn } from './src/middleware/authorize.js';

const BASE = 'http://localhost:8899';
const results = [];
const check = (label, cond, extra) => {
  results.push(cond);
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label + (extra ? ' :: ' + extra : ''));
};

const app = express();

// Token endpoint for tests — mints a JWT via Better Auth (same mechanism as the frontend).
app.get('/token/:email', async (req, res) => {
  const user = await db.collection('user').findOne({ email: req.params.email });
  if (!user) return res.status(404).json({ error: { status: 404, message: 'user not found' } });
  const { token } = await auth.api.signJWT({ body: { payload: { sub: user.id } } });
  res.json({ token });
});

// Protected demo routes.
app.get('/user', authenticate, requireUser, (req, res) => res.json({ ok: true, role: req.user.role }));
app.get('/vendor', authenticate, requireVendor, (req, res) => res.json({ ok: true, role: req.user.role }));
app.get('/admin', authenticate, requireAdmin, (req, res) => res.json({ ok: true, role: req.user.role }));
app.get('/role/:r', authenticate, async (req, res, next) => {
  requireRole(req.params.r)(req, res, () => res.json({ ok: true }));
});
app.get('/booking/:id', authenticate, async (req, res, next) => {
  const booking = await db.collection('bookings').findOne({ _id: new ObjectId(req.params.id) });
  req.resource = booking;
  next();
}, requireOwn('resource'), (req, res) => res.json({ ok: true }));

// Setup: users with roles user/vendor/admin + one booking each.
const EMAILS = { user: 'auth-user@example.com', vendor: 'auth-vendor@example.com', admin: 'auth-admin@example.com' };
const userDocs = {};
for (const [role, email] of Object.entries(EMAILS)) {
  await db.collection('user').deleteOne({ email });
  const oid = new ObjectId();
  await db.collection('user').insertOne({ _id: oid, id: oid.toString(), email, name: role, emailVerified: true, role });
  userDocs[role] = await db.collection('user').findOne({ email });
}
const bookingDocs = {};
for (const role of Object.keys(EMAILS)) {
  await db.collection('bookings').deleteMany({ ownerId: userDocs[role].id });
  const oid = new ObjectId();
  await db.collection('bookings').insertOne({ _id: oid, ownerId: userDocs[role].id, title: role });
  bookingDocs[role] = await db.collection('bookings').findOne({ ownerId: userDocs[role].id });
}

const server = app.listen(8899);
await new Promise((resolve) => server.once('listening', resolve));

const get = async (path, token) => {
  const r = await fetch(BASE + path, token ? { headers: { Authorization: 'Bearer ' + token } } : undefined);
  return { status: r.status };
};

const tokens = {};
for (const role of Object.keys(EMAILS)) {
  const r = await fetch(BASE + '/token/' + EMAILS[role]);
  tokens[role] = (await r.json()).token;
}

// 1) No token -> 401 on all protected routes.
check('GET /user (no token) -> 401', (await get('/user')).status === 401);
check('GET /vendor (no token) -> 401', (await get('/vendor')).status === 401);
check('GET /admin (no token) -> 401', (await get('/admin')).status === 401);
check('GET /role/user (no token) -> 401', (await get('/role/user')).status === 401);
check('GET /booking/<id> (no token) -> 401', (await get('/booking/' + bookingDocs.user._id)).status === 401);

// 2) user role: can access user routes; denied vendor/admin.
check('GET /user (user) -> 200', (await get('/user', tokens.user)).status === 200);
check('GET /vendor (user) -> 403', (await get('/vendor', tokens.user)).status === 403);
check('GET /admin (user) -> 403', (await get('/admin', tokens.user)).status === 403);
check('GET /role/user (user) -> 200', (await get('/role/user', tokens.user)).status === 200);
check('GET /role/vendor (user) -> 403', (await get('/role/vendor', tokens.user)).status === 403);
check('GET /role/admin (user) -> 403', (await get('/role/admin', tokens.user)).status === 403);
check('GET /booking/<own> (user) -> 200', (await get('/booking/' + bookingDocs.user._id)).status === 200);
check('GET /booking/<vendor> (user) -> 403', (await get('/booking/' + bookingDocs.vendor._id)).status === 403);
check('GET /booking/<admin> (user) -> 403', (await get('/booking/' + bookingDocs.admin._id)).status === 403);

// 3) vendor role: can access user+vendor; denied admin.
check('GET /user (vendor) -> 200', (await get('/user', tokens.vendor)).status === 200);
check('GET /vendor (vendor) -> 200', (await get('/vendor', tokens.vendor)).status === 200);
check('GET /admin (vendor) -> 403', (await get('/admin', tokens.vendor)).status === 403);
check('GET /role/vendor (vendor) -> 200', (await get('/role/vendor', tokens.vendor)).status === 200);
check('GET /role/admin (vendor) -> 403', (await get('/role/admin', tokens.vendor)).status === 403);
check('GET /booking/<own> (vendor) -> 200', (await get('/booking/' + bookingDocs.vendor._id)).status === 200);
check('GET /booking/<user> (vendor) -> 403', (await get('/booking/' + bookingDocs.user._id)).status === 403);
check('GET /booking/<admin> (vendor) -> 403', (await get('/booking/' + bookingDocs.admin._id)).status === 403);

// 4) admin role: can access everything, but cannot impersonate.
check('GET /user (admin) -> 200', (await get('/user', tokens.admin)).status === 200);
check('GET /vendor (admin) -> 200', (await get('/vendor', tokens.admin)).status === 200);
check('GET /admin (admin) -> 200', (await get('/admin', tokens.admin)).status === 200);
check('GET /booking/<admin> (admin) -> 200', (await get('/booking/' + bookingDocs.admin._id)).status === 200);
check('GET /booking/<user> (admin) -> 403', (await get('/booking/' + bookingDocs.user._id)).status === 403);
check('GET /booking/<vendor> (admin) -> 403', (await get('/booking/' + bookingDocs.vendor._id)).status === 403);

// 5) Blocked accounts cannot access protected features.
await db.collection('user').updateOne({ email: EMAILS.user }, { $set: { banned: true } });
check('GET /user (banned user) -> 401', (await get('/user', tokens.user)).status === 401);
await db.collection('user').updateOne({ email: EMAILS.user }, { $set: { banned: false } });
check('GET /user (unbanned user) -> 200', (await get('/user', tokens.user)).status === 200);

// 6) Cleanup.
for (const email of Object.values(EMAILS)) {
  const u = await db.collection('user').findOne({ email });
  if (u) await db.collection('user').deleteOne({ _id: u._id });
}
for (const b of Object.values(bookingDocs)) {
  await db.collection('bookings').deleteOne({ _id: b._id });
}

server.close();
console.log(results.every(Boolean) ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
