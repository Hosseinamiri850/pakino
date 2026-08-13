import { db, schema } from '@/lib/db/client';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { enqueueExistingJob } from '@/lib/jobs';
import { estimateCredits, ensureCredits, deductCredits } from '@/lib/credits';
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

    const estimated = estimateCredits(job.type, getEnv().MAX_VIDEO_DURATION);
    await ensureCredits(session.userId, estimated);
    await deductCredits(session.userId, estimated, job.id, 'job_start');

    await db
      .update(schema.jobs)
      .set({ status: 'ANALYZING', progress: 5, startedAt: new Date(), creditsUsed: estimated })
      .where(eq(schema.jobs.id, job.id));
    await enqueueExistingJob(job.id);

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
