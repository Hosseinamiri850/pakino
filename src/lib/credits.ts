import { db, schema } from '@/lib/db/client';
import { eq, sql } from 'drizzle-orm';
import { getEnv } from '@/lib/env';
import type { MediaKind } from '@/lib/types';
import { AppError } from '@/lib/types';

export function estimateCredits(kind: MediaKind, durationSeconds: number | null): number {
  if (kind === 'image') return getEnv().CREDITS_PER_IMAGE;
  const secs = durationSeconds ?? 0;
  return Math.ceil(secs / 10) * getEnv().CREDITS_PER_VIDEO_10_SECONDS;
}

export async function getUserCredits(userId: string): Promise<number> {
  const [u] = await db.select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return u?.credits ?? 0;
}

export async function ensureCredits(userId: string, needed: number): Promise<void> {
  const have = await getUserCredits(userId);
  if (have < needed) throw new AppError('INSUFFICIENT_CREDITS');
}

export async function deductCredits(userId: string, amount: number, jobId: string | null, reason: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} - ${amount}` })
    .where(eq(schema.users.id, userId));
  await recordCreditTransaction(userId, -amount, reason, jobId);
}

export async function refundCredits(userId: string, amount: number, jobId: string | null): Promise<void> {
  await db
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} + ${amount}` })
    .where(eq(schema.users.id, userId));
  await recordCreditTransaction(userId, amount, 'refund', jobId);
}

export async function recordCreditTransaction(userId: string, delta: number, reason: string, jobId: string | null): Promise<void> {
  await db.insert(schema.creditTransactions).values({ userId, delta, reason, jobId });
}
