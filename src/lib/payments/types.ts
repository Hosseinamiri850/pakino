export interface CreatePaymentInput {
  amountToman: number;
  description: string;
  callbackUrl: string;
  userIdentifier?: string;
}

export interface CreatePaymentResult {
  authority: string;
  redirectUrl: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  refId?: string;
  message?: string;
}

export interface PaymentProvider {
  readonly id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(authority: string, amountToman: number): Promise<VerifyPaymentResult>;
  // refundPayment optional (ZarinPal sandbox exposes limited refund)
  refundPayment?(_authority: string, _amountToman: number): Promise<{ ok: boolean; message?: string }>;
}
