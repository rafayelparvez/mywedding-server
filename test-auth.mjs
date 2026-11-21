// Server-side validation of the Better Auth JWT/JWKS API usage.
import { ObjectId } from 'mongodb';
import { db } from './src/config/db.js';
import { auth, adapter } from './src/auth/index.js';

const log = (label, value) => console.log(label + ' ' + JSON.stringify(value));

// 1) Create a test user (mimic what Better Auth stores).
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
log('1) inserted user:', { id: user?.id, email: user?.email });

// 2) Mint a JWT via Better Auth's jwt plugin (the same mechanism the frontend uses).
const signed = await auth.api.signJWT({ body: { payload: { sub: user.id } } });
const token = signed?.token;
log('2) signJWT:', { ok: Boolean(token), tokenLength: token?.length });
if (!token) throw new Error('signJWT failed');

// 3) Verify via Better Auth's verifyJWT endpoint.
const verified = await auth.api.verifyJWT({ body: { token, issuer: 'http://localhost:3000' } });
log('3) verifyJWT payload:', verified?.payload
  ? { sub: verified.payload.sub, iss: verified.payload.iss, aud: verified.payload.aud, exp: verified.payload.exp }
  : verified?.payload ?? null);

// 4) Adapter lookup — what the middleware uses to load the user.
const found = await adapter.findOne({ model: 'user', where: [{ field: 'id', value: user.id }] });
log('4) adapter.findOne:', found ? { id: found.id, email: found.email, banned: found.banned ?? null } : null);

// 5) Expired token should fail verification.
const expired = await auth.api.signJWT({ body: { payload: { sub: user.id, exp: Math.floor(Date.now() / 1000) - 10 } } });
const verifiedExpired = await auth.api.verifyJWT({ body: { token: expired?.token, issuer: 'http://localhost:3000' } });
log('5) verifyJWT(expired):', verifiedExpired?.payload ?? null);

// 6) Tampered token should fail verification.
const tampered = token.slice(0, -6) + 'AAAAAA';
const verifiedTampered = await auth.api.verifyJWT({ body: { token: tampered, issuer: 'http://localhost:3000' } });
log('6) verifyJWT(tampered):', verifiedTampered?.payload ?? null);

// 7) Cleanup.
await db.collection('user').deleteOne({ _id });
console.log('7) test user deleted');
