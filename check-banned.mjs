// Empirical check: does the Better Auth adapter return the `banned` field?
import { ObjectId } from 'mongodb';
import { db } from './src/config/db.js';
import { auth, authAdapter } from './src/auth/index.js';

const _id = new ObjectId();
await db.collection('user').insertOne({
  _id,
  id: _id.toString(),
  email: 'banned-check@example.com',
  name: 'Banned Check',
  emailVerified: true,
});
const adapter = await authAdapter();
const before = await adapter.findOne({ model: 'user', where: [{ field: 'id', value: _id.toString() }] });
console.log('before:', JSON.stringify({ id: before?.id, banned: before?.banned ?? null }));
await db.collection('user').updateOne({ _id }, { $set: { banned: true } });
const after = await adapter.findOne({ model: 'user', where: [{ field: 'id', value: _id.toString() }] });
console.log('after:', JSON.stringify({ id: after?.id, banned: after?.banned ?? null }));
const raw = await db.collection('user').findOne({ _id });
console.log('raw doc banned:', raw?.banned);
await db.collection('user').deleteOne({ _id });
