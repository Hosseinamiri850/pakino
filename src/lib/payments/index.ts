import { getEnv } from '@/lib/env';
import { zarinpal } from './zarinpal';
import { mockPayment } from './mock';
import type { PaymentProvider } from './types';

export function getPaymentProvider(): PaymentProvider {
  return getEnv().ZARINPAL_MERCHANT_ID ? zarinpal : mockPayment;
}
