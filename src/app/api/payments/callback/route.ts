import { db, schema } from '@/lib/db/client';
import { eq, sql } from 'drizzle-orm';
import { getPaymentProvider } from '@/lib/payments';
import { getEnv } from '@/lib/env';
import { recordCreditTransaction } from '@/lib/credits';
import { AppError } from '@/lib/types';
import { ok, fail, handleError } from '@/lib/api/http';
import { NextResponse } from 'next/server';

export async function GET(_req: Request) {
  try {
    const provider = getPaymentProvider();
    if (provider.id !== 'mock') {
      return NextResponse.redirect(new URL('/dashboard?payment=failed', getEnv().APP_URL));
    }
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const authority = url.searchParams.get('Authority') ?? url.searchParams.get('authority');
    const status = url.searchParams.get('Status') ?? 'OK';
    const userId = url.searchParams.get('user');
    const plan = url.searchParams.get('plan');
    if (!authority || !userId || !plan) return fail('generic', 400);

    const [tx] = await db
      .select()
      .from(schema.paymentTransactions)
      .where(eq(schema.paymentTransactions.providerAuthority, authority))
      .limit(1);
    if (!tx) return fail('NOT_FOUND', 404);
    if (status !== 'OK') throw new AppError('PROCESSING_FAILED', 'payment not ok', 400);

    const provider = getPaymentProvider();
    const verify = await provider.verifyPayment(authority, tx.amountToman);
    if (!verify.verified) throw new AppError('PROCESSING_FAILED', verify.message, 400);

    await db
      .update(schema.paymentTransactions)
      .set({ status: 'verified', providerRefId: verify.refId, verifiedAt: new Date() })
      .where(eq(schema.paymentTransactions.id, tx.id));

    const planCredits = tx.credits;
    await db
      .update(schema.users)
      .set({ credits: sql`${schema.users.credits} + ${planCredits}`, plan: tx.plan })
      .where(eq(schema.users.id, tx.userId));
    await recordCreditTransaction(tx.userId, planCredits, 'purchase', null);

    return NextResponse.redirect(new URL('/dashboard?payment=success', getEnv().APP_URL));
  } catch (e) {
    return handleError(e);
  }
}
