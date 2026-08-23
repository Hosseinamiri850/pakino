/**
 * Credit system integration tests — run against a REAL PostgreSQL instance.
 * Atomicity, uniqueness constraints and row-lock serialization cannot be
 * proven with mocks, so these tests need the dev database (docker compose).
 * The suite skips itself when no database is reachable.
 *
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { sql, cleanPakinoTables } from './test-db';
import { deductCredits, refundJobRemainingCredits, getUserCredits } from '@/lib/credits';

let dbUp = false;
try {
  await sql`SELECT 1`;
  dbUp = true;
} catch {
  console.warn('[credits-integration] PostgreSQL unreachable — skipping integration suite');
}

const suite = dbUp ? describe : describe.skip;

async function seedUser(credits: number): Promise<string> {
  const [row] = await sql`
    INSERT INTO users (email, password_hash, credits) VALUES (${`t${crypto.randomUUID()}@test.local`}, 'x', ${credits})
    RETURNING id
  `;
  return row!.id as string;
}

async function seedJob(userId: string, creditsUsed: number | null, creditsRefunded = 0): Promise<string> {
  const [row] = await sql`
    INSERT INTO jobs (user_id, type, status, credits_used, credits_refunded)
    VALUES (${userId}, 'image', 'ANALYZING', ${creditsUsed}, ${creditsRefunded})
    RETURNING id
  `;
  return row!.id as string;
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await sql`SELECT credits FROM users WHERE id = ${userId}`;
  return row!.credits as number;
}

async function ledgerRows(jobId: string): Promise<{ delta: number; reason: string }[]> {
  return (await sql`SELECT delta, reason FROM credit_transactions WHERE job_id = ${jobId} ORDER BY created_at`) as {
    delta: number;
    reason: string;
  }[];
}

suite('credit system (real PostgreSQL)', () => {
  beforeEach(async () => {
    await cleanPakinoTables();
  });

  it('deducts atomically when balance is sufficient and records the ledger row', async () => {
    const userId = await seedUser(50);
    const jobId = await seedJob(userId, null);

    const deducted = await deductCredits(userId, 5, jobId, 'job_start');

    expect(deducted).toBe(5);
    expect(await balanceOf(userId)).toBe(45);
    expect(await getUserCredits(userId)).toBe(45);
    const rows = await ledgerRows(jobId);
    expect(rows).toEqual([{ delta: -5, reason: 'job_start' }]);
  });

  it('rejects deduction above balance — credits never go negative', async () => {
    const userId = await seedUser(3);
    const jobId = await seedJob(userId, null);

    await expect(deductCredits(userId, 5, jobId, 'job_start')).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      status: 402,
    });
    expect(await balanceOf(userId)).toBe(3);
    expect(await ledgerRows(jobId)).toEqual([]);
  });

  it('serializes concurrent deductions — successes never overdraw the wallet', async () => {
    const userId = await seedUser(100);
    // 8 concurrent deductions of 30 against a 100 balance: exactly 3 can win,
    // regardless of interleaving order.
    const jobs = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => seedJob(userId, null)));

    const results = await Promise.allSettled(jobs.map((jobId) => deductCredits(userId, 30, jobId, 'job_start')));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(3);
    expect(rejected.length).toBe(5);
    for (const r of rejected) expect((r as PromiseRejectedResult).reason.code).toBe('INSUFFICIENT_CREDITS');
    expect(await balanceOf(userId)).toBe(10);

    const rows = (await sql`SELECT count(*)::int AS n FROM credit_transactions WHERE user_id = ${userId}`) as {
      n: number;
    }[];
    expect(rows[0]!.n).toBe(3);
  });

  it('allows at most one successful job_start deduction per job', async () => {
    const userId = await seedUser(100);
    const jobId = await seedJob(userId, null);

    await deductCredits(userId, 5, jobId, 'job_start');
    // Second attempt hits the (job_id, reason) unique index; its UPDATE rolls
    // back with the transaction, so the balance is charged exactly once.
    await expect(deductCredits(userId, 5, jobId, 'job_start')).rejects.toBeTruthy();
    expect(await balanceOf(userId)).toBe(95);
    expect((await ledgerRows(jobId)).length).toBe(1);
  });

  it('refunds exactly the un-refunded remainder, exactly once', async () => {
    const userId = await seedUser(0);
    const jobId = await seedJob(userId, 30);

    const first = await refundJobRemainingCredits(jobId, userId);
    expect(first).toBe(30);
    expect(await balanceOf(userId)).toBe(30);

    // Duplicate (retry/crash-recovery) refunds nothing further.
    const second = await refundJobRemainingCredits(jobId, userId);
    expect(second).toBe(0);
    expect(await balanceOf(userId)).toBe(30);

    const rows = await ledgerRows(jobId);
    expect(rows).toEqual([{ delta: 30, reason: 'refund' }]);
    const [job] = await sql<{ credits_used: number; credits_refunded: number }[]>`
      SELECT credits_used, credits_refunded FROM jobs WHERE id = ${jobId}
    `;
    expect(Number(job!.credits_refunded)).toBe(Number(job!.credits_used));
  });

  it('never refunds more than was deducted', async () => {
    const userId = await seedUser(0);
    const jobId = await seedJob(userId, 12, 12); // fully refunded already

    const refunded = await refundJobRemainingCredits(jobId, userId);
    expect(refunded).toBe(0);
    expect(await balanceOf(userId)).toBe(0);
  });
});
