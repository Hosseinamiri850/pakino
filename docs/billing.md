# Billing (credits + plans + ZarinPal)

## Plans

Server-side, configurable — **not** hardcoded in client code. Display defaults in
`src/lib/plans.ts`; real pricing/credit amounts should be enforced from env or a future
`plans` table.

| Plan | Credits | Price (Toman) | Notes |
|------|---------|---------------|-------|
| free | 50 | 0 | anon-tier; size/duration caps |
| mvp | 1000 | 99,000 | priority queue, longer videos |
| proPlus | 5000 | 390,000 | fast queue |

## Credits

- `CREDITS_PER_IMAGE` (default 5) per image.
- `CREDITS_PER_VIDEO_10_SECONDS` (default 10) × `ceil(duration / 10)` per video.
- Deducted at enqueue (in `POST /api/jobs`). **Refunded on FAILED** by the worker
  (`worker/app/db.refund_credits` → `credit_transactions` row `reason=refund`).
- `NO_WATERMARK_DETECTED` completes; no refund (configurable policy).

## PaymentProvider interface

```ts
interface PaymentProvider {
  readonly id: string;
  createPayment(input: { amountToman; description; callbackUrl; userIdentifier? }): Promise<{ authority; redirectUrl }>;
  verifyPayment(authority, amountToman): Promise<{ verified; refId?; message? }>;
  refundPayment?(authority, amountToman): Promise<{ ok; message? }>;
}
```

Implementations:

- `zarinpal` — uses ZarinPal v4 `request.json` / `verify.json`. Enabled when
  `ZARINPAL_MERCHANT_ID` is set; sandbox toggled by `ZARINPAL_SANDBOX`.
- `mock` — used when no merchant id is set, so local dev needs zero gateway config. The mock
  callback (`/api/payments/mock-callback`) redirects to the real verify path.

Secrets (`ZARINPAL_MERCHANT_ID`) live only in server env — never bundled to the client.

## Verify flow

1. `POST /api/payments/create` → provider `createPayment` → store `payment_transactions` (status `pending`) → return `redirectUrl`.
2. User pays at ZarinPal → redirected back to `GET/POST /api/payments/callback?Authority=...&Status=OK&user=...&plan=...`.
3. Server calls `verifyPayment(authority, amount)` → on success: mark `verified`, credit the user
   (`users.credits += plan.credits`, set `plan`), record `credit_transactions reason=purchase` → redirect to `/dashboard?payment=success`.
4. On failure → redirect to `/dashboard?payment=failed`.

`refundPayment` is declared on the interface for future use but not invoked by the MVP flow.
