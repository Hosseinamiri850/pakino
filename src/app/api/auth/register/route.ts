import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createSession } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/api/rate-limit';
import { registerSchema } from '@/lib/validation/auth';
import { ok, fail, handleError, getClientIp } from '@/lib/api/http';
import { recordCreditTransaction } from '@/lib/credits';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp(req);
    const rl = await rateLimit(`register:${ip}`, 5, 600);
    if (!rl.ok) return fail('RATE_LIMITED', 429);

    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return fail('generic', 400, parsed.error.flatten());

    const { email, password } = parsed.data;
    const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (existing.length > 0) return fail('emailExists', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash, credits: getEnv().ANON_FREE_CREDITS, plan: 'free' })
      .returning();

    await recordCreditTransaction(user!.id, getEnv().ANON_FREE_CREDITS, 'welcome', null);
    await createSession({ userId: user!.id, email: user!.email });
    return ok({ userId: user!.id });
  } catch (e) {
    return handleError(e);
  }
}
