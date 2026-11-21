// End-to-end authentication middleware test (run while the server is up).
import { ObjectId } from 'mongodb';
import { db } from './src/config/db.js';
import { auth } from './src/auth/index.js';

const base = 'http://localhost:8000';
const results = [];
const check = (label, cond, extra) => {
  results.push(cond);
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label + (extra ? ' :: ' + extra : ''));
};

// Setup: create the test user.
const _id = new ObjectId();
await db.collection('user').insertOne({
  _id,
  id: _id.toString(),
  email: 'auth-test@example.com',
  emailVerified: true,
  name: 'Auth Test',
  image: null,
});
const user = await db.collection('user').findOne({ _id });

// Mint a valid JWT via Better Auth (same mechanism as the frontend).
const { token } = await auth.api.signJWT({ body: { payload: { sub: user.id } } });

// 1) No token -> 401
let r = await fetch(base + '/api/me');
check('GET /api/me without token -> 401', r.status === 401, String(r.status));

// 2) Garbage token -> 401
r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer abc.def.ghi' } });
check('GET /api/me with garbage token -> 401', r.status === 401, String(r.status));

// 3) Tampered token -> 401
r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token.slice(0, -6) + 'AAAAAA' } });
check('GET /api/me with tampered token -> 401', r.status === 401, String(r.status));

// 4) Valid token -> 200 + verified user
r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
const body = await r.json().catch(() => null);
check('GET /api/me with valid token -> 200', r.status === 200, String(r.status));
check('  returns the verified user', body?.id === user.id && body?.email === user.email, JSON.stringify(body));

// 5) Expired token -> 401
const { token: expiredToken } = await auth.api.signJWT({ body: { payload: { sub: user.id, exp: Math.floor(Date.now() / 1000) - 10 } } });
r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + expiredToken } });
check('GET /api/me with expired token -> 401', r.status === 401, String(r.status));

// 6) Blocked (banned) user -> 401, then unblocked -> 200
await db.collection('user').updateOne({ _id }, { $set: { banned: true } });
r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
check('GET /api/me for banned user -> 401', r.status === 401, String(r.status));
await db.collection('user').updateOne({ _id }, { $set: { banned: false } });
r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
check('GET /api/me for unbanned user -> 200', r.status === 200, String(r.status));

// 7) Public routes still work
r = await fetch(base + '/');
check('GET / still 200', r.status === 200, String(r.status));
r = await fetch(base + '/health');
check('GET /health still 200', r.status === 200, String(r.status));
r = await fetch(base + '/nope');
check('unknown route still 404 JSON', r.status === 404);

// 8) POST /api/me without token -> 401
r = await fetch(base + '/api/me', { method: 'POST' });
check('POST /api/me without token -> 401', r.status === 401, String(r.status));

// Cleanup
await db.collection('user').deleteOne({ _id });
console.log(results.every(Boolean) ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
