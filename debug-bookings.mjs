// Debug ownership route flow.
import express from 'express';
import { ObjectId } from 'mongodb';

import { db } from './src/config/db.js';
import { auth } from './src/auth/index.js';
import { authenticate } from './src/middleware/authenticate.js';
import { requireOwn } from './src/middleware/authorize.js';

const app = express();
app.get('/booking/:id', authenticate, async (req, res, next) => {
  const booking = await db.collection('bookings').findOne({ _id: new ObjectId(req.params.id) });
  console.log('route: params.id=', req.params.id, '| booking found?', Boolean(booking), booking ? { ownerId: booking.ownerId } : null);
  req.resource = booking;
  next();
}, requireOwn('resource'), (req, res) => res.json({ ok: true }));

const oid = new ObjectId();
await db.collection('user').deleteOne({ email: 'auth-user@example.com' });
await db.collection('user').insertOne({ _id: oid, id: oid.toString(), email: 'auth-user@example.com', name: 'user', emailVerified: true, role: 'user' });
await db.collection('bookings').deleteOne({ ownerId: oid.toString() });
const bid = new ObjectId();
await db.collection('bookings').insertOne({ _id: bid, ownerId: oid.toString(), title: 't' });

const server = app.listen(8899);
await new Promise((r) => server.once('listening', r));
const user = await db.collection('user').findOne({ email: 'auth-user@example.com' });
console.log('user doc:', { _id: user._id, id: user.id });
const booking = await db.collection('bookings').findOne({ ownerId: user.id });
console.log('booking:', booking ? { _id: booking._id, ownerId: booking.ownerId } : null);

const { token } = await auth.api.signJWT({ body: { payload: { sub: user.id } } });
const r = await fetch('http://localhost:8899/booking/' + bid, { headers: { Authorization: 'Bearer ' + token } });
console.log('GET /booking/' + bid, '->', r.status, await r.text());

server.close();
await db.collection('user').deleteOne({ email: 'auth-user@example.com' });
await db.collection('bookings').deleteOne({ ownerId: oid.toString() });
process.exit(0);
