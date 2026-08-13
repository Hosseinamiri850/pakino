# Architecture

## Components

1. **Next.js app** (`src/app`) — UI, Route Handler APIs (`/api/*`), auth, i18n.
2. **Python worker** (`worker/`) — consumes `pakino:jobs` from Redis, processes media, writes results to S3 + Postgres.
3. **PostgreSQL** — `users`, `jobs`, `files`, `credit_transactions`, `subscriptions`, `payment_transactions` (`drizzle/0000_init.sql`).
4. **Redis** — job queue (cross-language `RPUSH`/`BRPOP` JSON list), rate-limit counters, cancel flags.
5. **S3-compatible storage** — MinIO locally; uploads/outputs keyed by UUID; presigned URLs only ever reach the browser.

## Data flow

```
upload:  POST /api/uploads  → files row (UPLOADING) + presigned PUT URL
upload:  PUT <presigned>     → object lands in S3
enqueue: POST /api/jobs      → est. credits deducted → JobMessage RPUSH'd
worker:  BRPOP               → download → detect → remove → encode → upload
worker:  UPDATE jobs          → status/progress/provider/completed_at
client:  GET /api/jobs/:id    → poll until COMPLETED|FAILED|CANCELLED
```

## Boundaries

- No per-responsibility microservices. Worker is the only separate runtime process.
- Worker never runs user-video processing inside an HTTP request.
- DB access: Next.js via Drizzle (`postgres-js`), worker via `psycopg` — both target the same schema.
- Queue contract (`JobMessage`) is the cross-language boundary; keep `src/lib/queue/index.ts` and `worker/app/models.py` in sync.

## Credit lifecycle

- `estimateCredits` (server-side config, not hardcoded): image flat rate; video `ceil(duration/10) * per_10s`.
- Deducted at enqueue; **refunded on FAILED** (worker writes `credit_transactions` row with `reason=refund`).
- `NO_WATERMARK_DETECTED` completes without output — credits are not refunded (work was attempted); tune to taste.

## Security boundary

See [security.md](security.md). Inputs are validated at the API edge; storage keys are opaque UUIDs; FFmpeg is
invoked with arg lists only (`shell=False`); file retention is enforced by a cleanup job.
