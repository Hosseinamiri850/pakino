import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, VerifyPaymentResult } from './types';

export const mockPayment: PaymentProvider = {
  id: 'mock',

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const authority = `mock_${Buffer.from(input.description + input.amountToman).toString('base64url').slice(0, 12)}`;
    return { authority, redirectUrl: `/api/payments/mock-callback?authority=${authority}` };
  },

  async verifyPayment(_authority: string, _amount: number): Promise<VerifyPaymentResult> {
    return { verified: true, refId: 'mock_ref' };
  },
};
