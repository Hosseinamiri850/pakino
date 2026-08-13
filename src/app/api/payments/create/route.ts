import { db, schema } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import { getPaymentProvider } from '@/lib/payments';
import { getPlan } from '@/lib/plans';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/types';
import { ok, fail, handleError } from '@/lib/api/http';
import { z } from 'zod';

const body = z.object({ plan: z.enum(['mvp', 'proPlus']) });

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AppError('UNAUTHORIZED', undefined, 401);
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail('generic', 400);
    const plan = getPlan(parsed.data.plan);
    if (!plan.priceToman) return fail('generic', 400);

    const provider = getPaymentProvider();
    const result = await provider.createPayment({
      amountToman: plan.priceToman,
      description: `Pakino ${plan.id}`,
      callbackUrl: `${getEnv().ZARINPAL_CALLBACK_URL}?user=${session.userId}&plan=${plan.id}`,
      userIdentifier: session.userId,
    });

    await db.insert(schema.paymentTransactions).values({
      userId: session.userId,
      provider: provider.id,
      providerAuthority: result.authority,
      amountToman: plan.priceToman,
      plan: plan.id,
      credits: plan.credits,
      status: 'pending',
    });

    return ok({ redirectUrl: result.redirectUrl });
  } catch (e) {
    return handleError(e);
  }
}
