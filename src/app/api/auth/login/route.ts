import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/api/rate-limit';
import { loginSchema } from '@/lib/validation/auth';
import { ok, fail, handleError, getClientIp } from '@/lib/api/http';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp(req);
    const rl = await rateLimit(`login:${ip}`, 10, 600);
    if (!rl.ok) return fail('RATE_LIMITED', 429);

    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return fail('generic', 400, parsed.error.flatten());

    const { email, password } = parsed.data;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!user) return fail('invalidCreds', 401);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return fail('invalidCreds', 401);

    await createSession({ userId: user.id, email: user.email });
    return ok({ userId: user.id });
  } catch (e) {
    return handleError(e);
  }
}
