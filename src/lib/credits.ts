import { db, schema } from '@/lib/db/client';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getEnv } from '@/lib/env';
import type { MediaKind } from '@/lib/types';
import { AppError } from '@/lib/types';

export function estimateCredits(kind: MediaKind, durationSeconds: number | null): number {
  if (kind === 'image') return getEnv().CREDITS_PER_IMAGE;
  const secs = durationSeconds ?? 0;
  return videoCredits(secs);
}

/** Actual cost of a video from its real (ffprobe) duration — same formula as the reservation. */
export function videoCredits(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 10) * getEnv().CREDITS_PER_VIDEO_10_SECONDS;
}

export async function getUserCredits(userId: string): Promise<number> {
  const [u] = await db.select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return u?.credits ?? 0;
}

/**
 * Atomically deduct credits. The single guarded UPDATE makes the DB guarantee
 * `credits >= amount` — concurrent deductions serialize on the row lock and
 * losers see zero updated rows and throw INSUFFICIENT_CREDITS. The ledger
 * insert runs in the same transaction; the unique index on (job_id, reason)
 * rejects a second job_start for the same job, rolling the deduction back.
 * Returns the deducted amount.
 */
export async function deductCredits(userId: string, amount: number, jobId: string | null, reason: string): Promise<number> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.users)
      .set({ credits: sql`${schema.users.credits} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), gte(schema.users.credits, amount)))
      .returning({ credits: schema.users.credits });
    if (updated.length === 0) throw new AppError('INSUFFICIENT_CREDITS', undefined, 402);
    await tx.insert(schema.creditTransactions).values({ userId, delta: -amount, reason, jobId });
    return amount;
  });
}

export async function recordCreditTransaction(userId: string, delta: number, reason: string, jobId: string | null): Promise<void> {
  await db.insert(schema.creditTransactions).values({ userId, delta, reason, jobId });
}

/**
 * Refund the un-refunded remainder of a job's deducted credits. The guarded
 * CTE takes the job row lock and flips credits_refunded to credits_used in one
 * statement, so concurrent or retried calls refund exactly once and the total
 * refund can never exceed the deduction. Mirror of worker.app.db.refund_job_credits.
 * Returns the refunded amount (0 if nothing was left to refund).
 */
export async function refundJobRemainingCredits(jobId: string, userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      WITH remaining AS (
        SELECT id, credits_used - credits_refunded AS amount
        FROM jobs
        WHERE id = ${jobId}
          AND credits_used IS NOT NULL
          AND credits_refunded < credits_used
        FOR UPDATE
      )
      UPDATE jobs SET credits_refunded = jobs.credits_used
      FROM remaining
      WHERE jobs.id = remaining.id
      RETURNING remaining.amount
    `) as unknown as { amount: number }[];
    const amount = Number(res[0]?.amount ?? 0);
    if (!amount) return 0;
    await tx
      .update(schema.users)
      .set({ credits: sql`${schema.users.credits} + ${amount}`, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    await tx.insert(schema.creditTransactions).values({ userId, delta: amount, reason: 'refund', jobId });
    return amount;
  });
}
