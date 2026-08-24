# Job & Worker Reliability Plan

Design for making the job pipeline survive crashes, restarts, and duplicate
delivery. Companion to `JOB_RELIABILITY_AUDIT.md`.

## Core principle

**PostgreSQL is the source of truth. Redis is a best-effort transport.**

The queue loses messages (BRPOP + crash, Redis restart). Therefore nothing
critical may live only in Redis: every job's existence, state, and credits live
in Postgres; the queue is an optimization that gets work to workers fast.

Delivery model: **at-least-once delivery + idempotent processing**, achieved at
the database/business layer. No distributed exactly-once is attempted.

## State machine (smallest correct model)

Existing enum states are kept — no new status values:

```
UPLOADING ──claim──▶ ANALYZING ──enqueue+worker──▶ DETECTING ─▶ PROCESSING ─▶ ENCODING ─▶ COMPLETED
    ▲                    │                             │
    │ (claim released)   │ recovery/retry              │ failure → FAILED (+bounded refund)
    └────────────────────┘                             └─ CANCELLED (existing path)
```

`ANALYZING` means "claimed by the API, awaiting/undergoing worker pickup" — it is
the only ambiguous state and the only one recovery needs to reason about.
Worker-side states (`DETECTING/PROCESSING/ENCODING`) are progress detail inside
one attempt.

New columns on `jobs` (single migration `0002_job_reliability.sql`):

| Column | Purpose |
|---|---|
| `queued_at TIMESTAMPTZ` | when the message was enqueued (outbox dispatch time) |
| `heartbeat_at TIMESTAMPTZ` | worker liveness while processing |
| `attempt_count INT NOT NULL DEFAULT 0` | bounded retries |
| `last_error_code TEXT` | diagnostics for terminal failures |

No new tables except the outbox (below).

## Transactional outbox (CASE A/B)

The API cannot atomically commit a DB transaction AND push to Redis. Chosen
design — the standard transactional outbox, kept minimal:

1. Inside the SAME DB transaction as claim + deduction:
   - set job `ANALYZING`
   - insert `job_outbox(job_id)` row (`pending`)
2. COMMIT.
3. Dispatcher pushes RPUSH, then marks the outbox row `sent`, sets `queued_at`.

Crash windows and outcomes:

- crash before commit → no claim, no deduction, no outbox (user retries freely)
- crash after commit, before push → outbox row stays `pending`; dispatcher (run
  in-process after enqueue attempts, plus periodic sweep in the worker loop)
  re-pushes later. **At-least-once.**
- crash between RPUSH success and marking `sent` → duplicate RPUSH possible;
  harmless because worker claiming is idempotent (below).

The dispatcher lives where enqueue already happens (API route, immediate try)
and as a periodic sweep in the worker loop (`dispatch_pending_outbox`) so a dead
Next.js process never strands jobs: the worker heals the queue itself.

Why not BullMQ/Celery/RabbitMQ: our reliability requirement reduces to "a durable
record of un-acked work plus redelivery", which the outbox table provides with
zero new infrastructure. Documented per instructions.

## Worker idempotency (CASE C/D/E)

The worker atomically claims a job before processing:

```sql
UPDATE jobs
SET status='ANALYZING', heartbeat_at=now(), started_at=COALESCE(started_at, now()),
    attempt_count = attempt_count + 1
WHERE id = $1 AND status = 'ANALYZING' AND attempt_count < max_attempts
RETURNING id
```

- Only the successful claimant processes. A duplicate delivery finds status
  outside `ANALYZING` (or attempts exhausted) → logs and drops the message.
- `attempt_count < MAX_JOB_ATTEMPTS` gates reprocessing of stale jobs.
- The DB decides — no Python memory state involved.
- The existing guarded credit transitions make double-deduction impossible;
  refunds stay ledger-bounded regardless of how many attempts run.

## Heartbeat & stale recovery (CASE D/F/H)

Worker updates `heartbeat_at` every 30s during processing (cheap single UPDATE,
piggybacked on existing progress writes where possible).

A periodic recovery pass (runs in the worker loop, one leader-ish attempt via a
Postgres advisory lock so N workers don't fight):

1. Find stale jobs:
   `status IN ('ANALYZING','DETECTING','PROCESSING','ENCODING') AND
    COALESCE(heartbeat_at, started_at, created_at) < now() - stale_after()`.
   `stale_after` scales with job type: image → 10 min; video →
   `max(30 min, MAX_VIDEO_DURATION × 2 × attempts_so_far)`. Long legitimate
   videos are protected by both the multiplier and heartbeats refreshing.
2. For each stale job, guarded transition back to recoverable state and
   re-enqueue via the outbox (attempt_count already incremented by the next
   claim):
   `UPDATE ... SET status='ANALYZING', heartbeat_at=NULL WHERE id=$ AND status=$same`
   — if zero rows, another recovery pass won the race (idempotent).
3. If `attempt_count >= MAX_JOB_ATTEMPTS` → mark `FAILED`
   (`error_code='ATTEMPTS_EXHAUSTED'`, `last_error_code` preserved) and refund
   the remainder through the existing `refund_job_credits` ledger (exactly-once).

Recovery is idempotent: all transitions are single guarded UPDATEs; running the
pass twice cannot double-refund (ledger) or double-enqueue meaningfully
(worker claim arbitrates).

## Retry policy

`MAX_JOB_ATTEMPTS = 3` default (`MAX_JOB_ATTEMPTS` env). Rationale: covers
transient infra faults (worker OOM, S3 hiccup, deploy overlap) while bounding
worst-case load amplification to 3×. Not arbitrary: 2 leaves no margin for
crash-loops during deploys; >3 mostly retries permanent failures.

Transient vs permanent: worker classifies errors.

- PERMANENT (never retry): `UNSUPPORTED_FORMAT`, `FILE_TOO_LARGE`,
  `INVALID_VIDEO`, `NO_WATERMARK_DETECTED`(completes, doesn't fail),
  malformed messages → immediate `FAILED` + refund.
- TRANSIENT (eligible for retry): everything else — `PROCESSING_FAILED`,
  timeouts, S3/storage errors, worker death (no classification at all → treated
  as transient by recovery).

## Dead-letter / final failure

No separate DLQ structure: exceeding attempts marks the job `FAILED` in Postgres
with `error_code`, safe `error_message` (truncated, no stack traces), attempt
count, timestamps. That IS the dead letter store — queryable, user-visible via
the normal DTO. Internal stack traces stay in container logs only.

## File safety

- Processing already happens in a per-attempt `TemporaryDirectory`; hard kills
  leak files but each retry uses a fresh dir. Recovery pass additionally does a
  best-effort sweep of temp dirs older than 24h in the worker's tmp root.
- Output key is deterministic per job (`outputs/{job_id}.{ext}`); a retried
  upload overwrites cleanly instead of duplicating.
- Outputs become visible only via `output_file_id` set together with
  `status=COMPLETED` in one committed transaction — partial uploads can't be
  observed as results. (S3 multipart abort-on-crash leftovers are cleaned by the
  future retention reaper, out of scope here.)

## Credit safety (unchanged, verified)

- deduction: once per job (guarded claim + unique `(job_id,'job_start')` index)
- refunds: `credits_refunded` ledger bounds total refund ≤ `credits_used`,
  exactly-once per transition; retries/recovery reuse `refund_job_credits`
- video settlement (`reconcile_job_credits`) runs once per attempt safely — its
  guard makes repeat calls no-ops once settled below/at actual cost.

## Queue durability stance (CASE G)

Redis stays non-durable **by design**: losing it costs nothing because the
outbox table re-drives any job whose message died. This removes AOF tuning/
fsync tradeoffs from the critical path. `docker compose` keeps `--save ""` and
the docs state explicitly: Redis is a transport, not storage.

## Runtime architecture (Docker)

Local development (Windows host):

```
npm run dev                # Next.js hot-reload on :3000
docker compose up -d       # postgres(:5433), redis(:6379), minio(:9000), worker*
```

*worker runs in Docker locally too (FFmpeg parity), reading code via bind mount;
it connects to `postgres:5432` / `redis:6379` by service name inside the
compose network.

Production (single host):

```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- `Dockerfile.web`: multi-stage Next.js build → slim runtime, non-root, no dev
  deps. `output: 'standalone'` evaluated — NOT enabled (next-intl plugin +
  tracing build work fine with regular start; standalone adds copy steps without
  benefit here; plain `next start` on the full build is used).
- `worker/Dockerfile`: python:3.12-slim + ffmpeg + pinned requirements,
  non-root, runs `python -m worker`.
- `docker-compose.prod.yml` overlay: builds web+worker images, adds
  `restart: unless-stopped` for long-running services, wires env via
  `${DATABASE_URL}` style variables with sane defaults pointing at service
  names (`postgres://pakino:pakino@postgres:5432/pakino`). Port mapping 5433 on
  the host is PRESERVED (native Windows PG owns 5432).
- healthchecks: postgres/redis/minio exist; web gets an HTTP check against `/fa`;
  worker gets a lightweight `python -c` import check. Startup ordering uses
  `depends_on: condition: service_healthy`.

Restart policies are safe precisely because correctness lives in DB-guarded
transitions: restarting anything replays idempotently.

## Observability

Structured-ish logging already exists in the worker; this phase adds
`job_id=<uuid>` fields consistently, recovery actions (`requeued`, `failed`,
`attempts=N`), and dispatcher events. No secrets/tokens/user content logged.

## What we are NOT doing (explicitly)

- No BullMQ/RabbitMQ/Kafka.
- No new job states.
- No Redis persistence.
- No scheduled external cron — recovery rides the worker loop (workers are
  always present in every deployment shape).
