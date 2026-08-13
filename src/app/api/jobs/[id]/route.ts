import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { AppError } from '@/lib/types';
import { ok, handleError } from '@/lib/api/http';
import { mapJob } from '@/lib/jobs-dto';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new AppError('UNAUTHORIZED', undefined, 401);
    const { id } = await ctx.params;
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
    if (!job || job.userId !== session.userId) throw new AppError('NOT_FOUND', undefined, 404);
    return ok(await mapJob(job));
  } catch (e) {
    return handleError(e);
  }
}
