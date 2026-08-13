import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pakinoDb?: ReturnType<typeof createDb> };

function createDb() {
  const client = postgres(getEnv().DATABASE_URL, { max: 10, prepare: false });
  return drizzle(client, { schema });
}

export const db = globalForDb.pakinoDb ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForDb.pakinoDb = db;

export type DB = typeof db;
export { schema };
