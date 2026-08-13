import { redis } from '@/lib/queue/redis';

export async function rateLimit(key: string, max: number, windowSec: number): Promise<{ ok: boolean; remaining: number }> {
  const k = `pakino:rl:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSec);
  return { ok: count <= max, remaining: Math.max(0, max - count) };
}
