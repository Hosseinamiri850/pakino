import { getEnv } from '@/lib/env';
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, VerifyPaymentResult } from './types';

function apiBase(): string {
  return getEnv().ZARINPAL_SANDBOX ? 'https://sandbox.zarinpal.com/pg/v4/payment' : 'https://api.zarinpal.com/pg/v4/payment';
}

function gateBase(): string {
  return getEnv().ZARINPAL_SANDBOX ? 'https://sandbox.zarinpal.com/pg/StartPay' : 'https://www.zarinpal.com/pg/StartPay';
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const merchant = getEnv().ZARINPAL_MERCHANT_ID;
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...(body as Record<string, unknown>), merchant_id: merchant }),
  });
  return (await res.json()) as T;
}

export const zarinpal: PaymentProvider = {
  id: 'zarinpal',

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!getEnv().ZARINPAL_MERCHANT_ID) throw new Error('ZARINPAL_MERCHANT_ID not set');
    type Resp = { data?: { authority: string }; errors?: { message: string }[] };
    const r = await request<Resp>('/request.json', {
      amount: input.amountToman,
      description: input.description,
      callback_url: input.callbackUrl,
    });
    if (!r.data?.authority) throw new Error(r.errors?.[0]?.message ?? 'ZarinPal request failed');
    return { authority: r.data.authority, redirectUrl: `${gateBase()}/${r.data.authority}` };
  },

  async verifyPayment(authority: string, amountToman: number): Promise<VerifyPaymentResult> {
    type Resp = { data?: { code: number; ref_id?: number; message?: string }; errors?: { message: string }[] };
    const r = await request<Resp>('/verify.json', { amount: amountToman, authority });
    if (r.data?.code === 100 || r.data?.code === 101) {
      return { verified: true, refId: r.data.ref_id?.toString() };
    }
    return { verified: false, message: r.data?.message ?? r.errors?.[0]?.message ?? 'verify failed' };
  },
};
