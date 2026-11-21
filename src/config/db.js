import { MongoClient } from 'mongodb';

import { env } from './env.js';

// One shared client + DB handle. The DB name "mywedding" matches the frontend
// (mywedding/src/lib/auth.ts: client.db("mywedding")), so the server and the
// frontend share the same collections instead of duplicating auth data.
export const client = new MongoClient(env.MONGODB_URI);
export const db = client.db("mywedding");

export async function connect() {
  await client.connect();
  await db.admin().ping(); // Fail fast if the cluster is unreachable.
  return client;
}

export async function close() {
  await client.close();
}
