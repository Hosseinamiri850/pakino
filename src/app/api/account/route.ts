import { db, schema } from '@/lib/db/client';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { AppError } from '@/lib/types';
import { ok, handleError } from '@/lib/api/http';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AppError('UNAUTHORIZED', undefined, 401);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
    if (!user) throw new AppError('NOT_FOUND', undefined, 404);
    const [c] = await db.select({ n: count() }).from(schema.jobs).where(eq(schema.jobs.userId, session.userId));
    return ok({ credits: user.credits, plan: user.plan, totalProcessed: c?.n ?? 0 });
  } catch (e) {
    return handleError(e);
  }
}
