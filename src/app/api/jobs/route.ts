import { db, schema } from '@/lib/db/client';
import { and, eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { enqueueExistingJob } from '@/lib/jobs';
import { estimateCredits, deductCredits } from '@/lib/credits';
import { getEnv } from '@/lib/env';
import { mapJob } from '@/lib/jobs-dto';
import { AppError } from '@/lib/types';
import { ok, fail, handleError } from '@/lib/api/http';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AppError('UNAUTHORIZED', undefined, 401);
    const body = (await req.json().catch(() => ({}))) as { jobId: string };
    const parsed = z.object({ jobId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return fail('NOT_FOUND', 400);

    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, parsed.data.jobId)).limit(1);
    if (!job || job.userId !== session.userId) throw new AppError('NOT_FOUND', undefined, 404);

    // Video billing: reserve for the maximum allowed duration up front; the worker
    // settles to the actual ffprobe duration and refunds the difference (docs/billing.md).
    const reserved = estimateCredits(job.type, getEnv().MAX_VIDEO_DURATION);

    // Claim the job exactly once. Concurrent or retried POSTs lose this guarded
    // transition and become idempotent no-ops: no second deduction, no duplicate
    // queue message.
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.jobs)
        .set({ status: 'ANALYZING', progress: 5, startedAt: new Date(), creditsUsed: reserved })
        .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.status, 'UPLOADING')))
        .returning({ id: schema.jobs.id });
      if (rows.length === 0) return [];
      // Transactional outbox row commits atomically with the claim + deduction:
      // a crash before the Redis RPUSH leaves a durable pending record that the
      // dispatcher (API or worker loop) re-pushes later. heartbeat_at stays NULL
      // so the worker's claim UPDATE can win exactly once.
      await tx.insert(schema.jobOutbox).values({ jobId: job.id });
      return rows;
    });
    if (claimed.length === 0) return ok({ jobId: job.id });

    try {
      await deductCredits(session.userId, reserved, job.id, 'job_start');
    } catch (e) {
      // Atomic deduction failed (e.g. INSUFFICIENT_CREDITS): release the claim so
      // the user can retry after topping up. The deduction transaction rolled
      // back, so nothing was charged and no ledger row exists. The outbox row
      // from the claim above did commit — retire it so no dispatcher ever pushes
      // an unpaid job.
      await db
        .update(schema.jobOutbox)
        .set({ status: 'dead', sentAt: new Date() })
        .where(and(eq(schema.jobOutbox.jobId, job.id), eq(schema.jobOutbox.status, 'pending')));
      await db
        .update(schema.jobs)
        .set({ status: 'UPLOADING', progress: 0, startedAt: null, creditsUsed: null })
        .where(eq(schema.jobs.id, job.id));
      throw e;
    }

    try {
      await enqueueExistingJob(job.id);
      // Mark the immediate push done; any crash up to this point is healed by
      // dispatchPendingOutbox (worker loop runs it every idle cycle).
      await db
        .update(schema.jobOutbox)
        .set({ status: 'sent', sentAt: new Date() })
        .where(and(eq(schema.jobOutbox.jobId, job.id), eq(schema.jobOutbox.status, 'pending')));
      await db.update(schema.jobs).set({ queuedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    } catch (e) {
      // Queue unavailable right now: keep the outbox row pending so the worker's
      // periodic dispatcher re-pushes when Redis recovers. Do NOT refund/fail —
      // the durable record makes this recoverable instead of terminal.
      console.error(`enqueue failed; outbox will retry job_id=${job.id}`, e instanceof Error ? e.message : e);
      return ok({ jobId: job.id });
    }

    return ok({ jobId: job.id });
  } catch (e) {
    return handleError(e);
  }
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AppError('UNAUTHORIZED', undefined, 401);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100);

    const rows = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.userId, session.userId))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(limit);

    const items = await Promise.all(rows.map(mapJob));
    return ok({ items });
  } catch (e) {
    return handleError(e);
  }
}
