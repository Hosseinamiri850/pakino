import Redis, { type RedisOptions } from 'ioredis';
import { getEnv } from '@/lib/env';

const globalForRedis = globalThis as unknown as { pakinoRedis?: Redis; pakinoRedisSub?: Redis };

const opts: RedisOptions = { maxRetriesPerRequest: 3, lazyConnect: true };

function createClient() {
  const r = new Redis(getEnv().REDIS_URL, opts);
  return r;
}

export const redis = globalForRedis.pakinoRedis ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForRedis.pakinoRedis = redis;

export { getEnv };
