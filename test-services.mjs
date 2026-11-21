// Wedding service management API tests: public, vendor, admin, and business rules.
import { ObjectId } from 'mongodb';
import { db } from './src/config/db.js';
import { auth } from './src/auth/index.js';
import { services } from './src/db/collections.js';

const base = 'http://localhost:8000';
const results = [];
const check = (label, cond, extra) => {
  results.push(cond);
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label + (extra ? ' :: ' + extra : ''));
};

const call = async (token, path, { method = 'GET', body } = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const createService = async (token, fields) => {
  const r = await call(token, '/api/services', { method: 'POST', body: fields });
  return { status: r.status, doc: r.json };
};

// ---------- Setup: users ----------
const mkUser = async (email, name, role, extra = {}) => {
  const existing = await db.collection('user').findOne({ email });
  if (existing) await db.collection('user').deleteOne({ email });
  const oid = new ObjectId();
  await db.collection('user').insertOne({ _id: oid, id: oid.toString(), email, name, emailVerified: true, role, ...extra });
  return db.collection('user').findOne({ email });
};
const user = await mkUser('user@example.com', 'Public User', 'user');
const vendor = await mkUser('vendor@example.com', 'Vendor One', 'vendor');
const vendor2 = await mkUser('vendor2@example.com', 'Vendor Two', 'vendor');
const premiumVendor = await mkUser('premium@example.com', 'Premium Vendor', 'vendor', { subscriptionPlan: 'premium' });
const admin = await mkUser('admin@example.com', 'Admin User', 'admin');

const mintToken = async (u) => {
  const { token } = await auth.api.signJWT({ body: { payload: { sub: u.id } } });
  return token;
};
const [userToken, vendorToken, vendor2Token, premiumToken, adminToken] = await Promise.all([
  mintToken(user), mintToken(vendor), mintToken(vendor2), mintToken(premiumVendor), mintToken(admin),
]);

// ---------- Public: list ----------
let r = await call(null, '/api/services');
let list = r.json;
check('GET /api/services (no token) -> 200', r.status === 200, String(r.status));
check('  empty initially', list.services.length === 0 && list.total === 0);
r = await call(null, '/api/services?sortBy=name');
check('GET /api/services?sortBy=name -> 400', r.status === 400);
r = await call(null, '/api/services?limit=0');
check('GET /api/services?limit=0 -> 400', r.status === 400);

// ---------- Vendor: create ----------
const s1 = await createService(vendorToken, { serviceName: 'Flower Arrangement', category: 'Decor', description: 'Beautiful bouquet', price: 250, location: 'Metropolis, CA', images: ['https://example.com/img1.png'] });
check('POST /api/services -> 201', s1.status === 201, `status=${s1.status}`);
const s2 = await createService(vendorToken, { serviceName: 'Photography', category: 'Services', description: 'Portrait photos', price: 500, location: 'Metropolis' });
const s3 = await createService(vendorToken, { serviceName: 'Venue', category: 'Venues', description: 'Community center', price: 1200, location: 'Downtown' });
check('created s1/s2/s3', Boolean(s1.doc?._id && s2.doc?._id && s3.doc?._id));
check('new services default to pending', s1.doc?.status === 'pending' && s1.doc?.approved === false, JSON.stringify({ status: s1.doc?.status, approved: s1.doc?.approved }));
check('vendorId is set to the creating vendor', s1.doc?.vendorId === vendor.id);

// Validation on create
r = await call(vendorToken, '/api/services', { method: 'POST', body: { serviceName: '', category: 'X', description: 'y', price: 10 } });
check('POST /api/services empty name -> 400', r.status === 400);
r = await call(vendorToken, '/api/services', { method: 'POST', body: { serviceName: 'X', category: 'X', description: 'y', price: -5 } });
check('POST /api/services negative price -> 400', r.status === 400);
r = await call(vendorToken, '/api/services', { method: 'POST', body: { serviceName: 'X', category: 'X', description: 'y' } });
check('POST /api/services missing price -> 400', r.status === 400);
r = await call(userToken, '/api/services', { method: 'POST', body: { serviceName: 'X', category: 'X', description: 'y', price: 1 } });
check('POST /api/services as user role -> 403', r.status === 403);

// Vendor list
r = await call(vendorToken, '/api/vendor/services');
list = r.json;
check('GET /api/vendor/services -> 200 with 3', r.status === 200 && list.services.length === 3, `n=${list.services?.length}`);

// Public: not visible while pending
r = await call(null, '/api/services');
list = r.json;
check('public list empty while pending', list.services.length === 0);
r = await call(null, '/api/services/' + s1.doc._id);
check('public detail of pending -> 404', r.status === 404);

// Vendor update own service
r = await call(vendorToken, '/api/services/' + s1.doc._id, { method: 'PATCH', body: { price: 300, location: 'Downtown' } });
const upd = r.json;
check('PATCH /api/services/:id -> 200', r.status === 200 && upd.price === 300, `status=${r.status}`);
r = await call(vendorToken, '/api/services/' + s1.doc._id, { method: 'PATCH', body: { status: 'active' } });
check('vendor PATCH with status -> 400', r.status === 400);
r = await call(vendorToken, '/api/services/' + s1.doc._id, { method: 'PATCH', body: { name: 'nope' } });
check('vendor PATCH with unknown field -> 400', r.status === 400);

// Other vendor cannot modify
r = await call(vendor2Token, '/api/services/' + s2.doc._id, { method: 'PATCH', body: { serviceName: 'Hacked' } });
check('PATCH other vendor service -> 404', r.status === 404);
r = await call(vendor2Token, '/api/services/' + s2.doc._id + '/unpublish');
check('unpublish other vendor service -> 404', r.status === 404);

// Publish requires approval
r = await call(vendorToken, '/api/services/' + s1.doc._id + '/publish');
check('publish before approval -> 403', r.status === 403);

// Admin approve + publish s1, approve + publish s2
r = await call(adminToken, '/api/admin/services/' + s1.doc._id + '/approve', { method: 'POST' });
const ap1 = r.json;
check('admin approve s1 -> 200', r.status === 200 && ap1?.approved === true);
r = await call(vendorToken, '/api/services/' + s1.doc._id + '/publish');
const pub = r.json;
check('vendor publish s1 -> 200', r.status === 200, `status=${r.status}`);
check('  s1 status is active', pub?.status === 'active');

r = await call(adminToken, '/api/admin/services/' + s2.doc._id + '/approve', { method: 'POST' });
check('admin approve s2 -> 200', r.status === 200);
r = await call(vendorToken, '/api/services/' + s2.doc._id + '/publish');
check('vendor publish s2 -> 200', r.status === 200, `status=${r.status}`);

// Public now includes s1 + s2
r = await call(null, '/api/services');
list = r.json;
check('public list has s1 and s2', list.services.some((s) => s._id === s1.doc._id) && list.services.some((s) => s._id === s2.doc._id));
r = await call(null, '/api/services/' + s1.doc._id);
check('public detail of active -> 200', r.status === 200, String(r.status));

// Public filters
r = await call(null, '/api/services?category=Decor');
list = r.json;
check('filter category=Decor -> contains s1', list.services.some((s) => s._id === s1.doc._id));
r = await call(null, '/api/services?search=Photography');
list = r.json;
check('search=Photography -> contains s2', list.services.some((s) => s._id === s2.doc._id));
r = await call(null, '/api/services?location=Downtown');
list = r.json;
check('filter location=Downtown -> contains s1', list.services.some((s) => s._id === s1.doc._id));
r = await call(null, '/api/services?sortBy=price&sortOrder=asc');
list = r.json;
const pricesAsc = list.services.map((s) => s.price);
check('public sorted by price asc [300, 500]', JSON.stringify(pricesAsc) === JSON.stringify([300, 500]), JSON.stringify(pricesAsc));
r = await call(null, '/api/services?sortBy=price&sortOrder=desc');
list = r.json;
check('public sorted by price desc [500, 300]', JSON.stringify(list.services.map((s) => s.price)) === JSON.stringify([500, 300]));

// Admin list + filters
r = await call(adminToken, '/api/admin/services');
list = r.json;
check('GET /api/admin/services -> 200 with total >= 3', r.status === 200 && list.total >= 3, `total=${list.total}`);
r = await call(adminToken, '/api/admin/services?search=Flower');
list = r.json;
check('admin search=Flower -> contains s1', list.services.some((s) => s._id === s1.doc._id));
r = await call(adminToken, '/api/admin/services?status=active');
list = r.json;
check('admin filter status=active -> contains s1', list.services.some((s) => s._id === s1.doc._id));

// Admin status change
r = await call(adminToken, '/api/admin/services/' + s3.doc._id + '/status', { method: 'PATCH', body: { status: 'active' } });
check('admin set status active on non-approved -> 403', r.status === 403);
r = await call(adminToken, '/api/admin/services/' + s3.doc._id + '/status', { method: 'PATCH', body: { status: 'invalid' } });
check('admin set invalid status -> 400', r.status === 400);

// Reject flow
r = await call(adminToken, '/api/admin/services/' + s3.doc._id + '/approve', { method: 'POST' });
check('admin approve s3 -> 200', r.status === 200);
r = await call(adminToken, '/api/admin/services/' + s3.doc._id + '/reject', { method: 'POST' });
const rej = r.json;
check('admin reject -> 200', r.status === 200);
check('  rejected is not approved', rej?.approved === false);
r = await call(vendorToken, '/api/services/' + s3.doc._id + '/publish');
check('publish rejected service -> 403', r.status === 403);
r = await call(adminToken, '/api/admin/services/' + s3.doc._id + '/status', { method: 'PATCH', body: { status: 'active' } });
check('admin set status active on rejected -> 403', r.status === 403);
r = await call(adminToken, '/api/admin/services/' + s3.doc._id + '/status', { method: 'PATCH', body: { status: 'inactive' } });
check('admin set status inactive -> 200', r.status === 200);

// Free vendor limit (vendor2, role vendor, no premium plan)
const freeIds = [];
for (let i = 1; i <= 4; i++) {
  const cr = await createService(vendor2Token, { serviceName: `Free Service ${i}`, category: 'Decor', description: 'd', price: 100 });
  const doc = cr.doc;
  freeIds.push(doc?._id);
  await call(adminToken, '/api/admin/services/' + doc._id + '/approve', { method: 'POST' });
  const pr = await call(vendor2Token, '/api/services/' + doc._id + '/publish');
  if (i <= 3) check(`free vendor publish ${i} -> 200`, pr.status === 200, `status=${pr.status}`);
  else check('free vendor publish 4th -> 403 (limit)', pr.status === 403, `status=${pr.status}`);
}

// Premium vendor: unlimited (premiumVendor, subscriptionPlan premium)
const premiumIds = [];
for (let i = 1; i <= 4; i++) {
  const cr = await createService(premiumToken, { serviceName: `Premium Service ${i}`, category: 'Venues', description: 'd', price: 500 });
  const doc = cr.doc;
  premiumIds.push(doc?._id);
  await call(adminToken, '/api/admin/services/' + doc._id + '/approve', { method: 'POST' });
  const pr = await call(premiumToken, '/api/services/' + doc._id + '/publish');
  check(`premium vendor publish ${i} -> 200`, pr.status === 200, `status=${pr.status}`);
}

// Admin delete
r = await call(adminToken, '/api/admin/services/' + s2.doc._id, { method: 'DELETE' });
check('DELETE /api/admin/services/:id -> 200', r.status === 200, `status=${r.status}`);
r = await call(adminToken, '/api/admin/services/' + s2.doc._id, { method: 'DELETE' });
check('DELETE non-existent -> 404', r.status === 404);
r = await call(vendor2Token, '/api/admin/services/' + s2.doc._id, { method: 'DELETE' });
check('DELETE as vendor -> 403', r.status === 403, `status=${r.status}`);

// Unauthenticated / wrong-role access
r = await call(null, '/api/admin/services');
check('GET /api/admin/services (no token) -> 401', r.status === 401);
r = await call(userToken, '/api/admin/services/' + s1.doc._id + '/approve', { method: 'POST' });
check('POST /api/admin/services/:id/approve as user -> 403', r.status === 403);
r = await call(vendor2Token, '/api/services/' + s1.doc._id, { method: 'PATCH', body: { price: 1 } });
check('PATCH other vendor service via vendor2 -> 404', r.status === 404);

// ---------- Cleanup ----------
for (const id of [s1.doc?._id, s3.doc?._id, ...freeIds, ...premiumIds]) {
  if (id) await services.deleteOne({ _id: new ObjectId(id) });
}
for (const u of [user, vendor, vendor2, premiumVendor, admin]) {
  if (u) await db.collection('user').deleteOne({ id: u.id });
}

console.log(results.every(Boolean) ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
