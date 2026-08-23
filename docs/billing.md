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

### Billing policy (reservation → settlement)

Deduction happens in `POST /api/jobs` (`src/app/api/jobs/route.ts`):

1. **Claim** — the job transitions `UPLOADING → ANALYZING` via a guarded
   `UPDATE ... WHERE status='UPLOADING'`; a concurrent or retried request that
   loses this transition is an idempotent no-op (no second deduction, no
   duplicate queue message).
2. **Atomic deduction** — `deductCredits` (`src/lib/credits.ts`) is a single
   guarded `UPDATE users SET credits = credits - amount WHERE id = ? AND
   credits >= amount` plus the ledger insert, in one transaction. The DB
   guarantees the balance can never go negative and each job gets at most one
   successful `job_start` deduction (unique index
   `credit_transactions_job_reason_uq` on `(job_id, reason)`).
   Insufficient balance throws `INSUFFICIENT_CREDITS` (HTTP 402) and the claim
   is released back to `UPLOADING`.
3. **Reservation** — images reserve the flat rate. Videos reserve
   `ceil(MAX_VIDEO_DURATION / 10) × rate` because the real duration is unknown
   before upload processing.
4. **Settlement** — for videos with a measurable ffprobe duration (> 0), the
   worker settles `credits_used` to the actual cost
   (`ceil(duration / 10) × rate`) and refunds the difference immediately
   (`reconcile_job_credits`, `reason=reconcile`).

### Refund policy (all paths refund the un-refunded remainder)

Every refund goes through the job refund ledger (`jobs.credits_refunded`):
one atomic guarded statement moves `credits_refunded` up to `credits_used`, so
**a refund can never apply twice** (worker crash + recovery re-run included)
and **total refund can never exceed the deduction**.

| Path | Behavior |
|------|----------|
| processing / encoding / S3 / worker failure (`FAILED`) | refund remainder |
| `NO_WATERMARK_DETECTED` | refund remainder (no output → no charge) |
| cancellation (`CANCELLED`) | refund remainder |
| queue unavailable at enqueue | refund remainder + job `FAILED(QUEUE_UNAVAILABLE)` |
| successful job | keeps the settled (actual) cost |

The refunded amount is always `jobs.credits_used − jobs.credits_refunded` —
never inferred from job type or a fixed constant.

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
