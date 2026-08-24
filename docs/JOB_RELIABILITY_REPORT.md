# Job & Worker Reliability Report

Phase: make the Job + Redis Queue + Python Worker pipeline resilient to
crashes, retries, duplicate delivery, process restarts, and deployment
failures. Design: `JOB_RELIABILITY_PLAN.md`, analysis: `JOB_RELIABILITY_AUDIT.md`.

**Status: the reliability architecture is implemented and integration-tested.
This is NOT a "production ready" claim — see Remaining risks.**

## 1. Failure scenarios discovered

See `JOB_RELIABILITY_AUDIT.md` for the full case-by-case analysis (A–H). The
critical ones: crash between claim/deduction and enqueue permanently stranded
paid jobs; worker crash after BRPOP lost messages at-most-once; no recovery,
heartbeat, retry bound, or processing idempotency existed.

## 2–3. Architecture chosen and why

- **PostgreSQL is the source of truth; Redis is a best-effort transport.**
- Transactional **outbox** (`job_outbox` table) commits atomically with the job
  claim + credit deduction; a dispatcher pushes to Redis and marks rows sent.
  Lost/duplicated RPUSHes are healed by design instead of by Redis persistence.
- **At-least-once delivery + idempotent processing**: workers claim jobs via one
  guarded `UPDATE … WHERE status='ANALYZING' AND heartbeat_at IS NULL AND
  attempt_count < max`; losers drop the message. No distributed exactly-once.
- No new queue framework (BullMQ/RabbitMQ rejected per plan), no new job states,
  no Redis persistence requirement.

## 4. Database migrations

`drizzle/0002_job_reliability.sql`:
- `jobs.queued_at`, `jobs.heartbeat_at`, `jobs.attempt_count`,
  `jobs.last_error_code`
- index on `(status, COALESCE(heartbeat_at, started_at, created_at))`
- `job_outbox` table (`job_id`, `status pending|sent|dead`, timestamps) with a
  partial index over pending rows

## 5. Queue changes

- API claim transaction now inserts an outbox row in the same DB transaction
  (`src/app/api/jobs/route.ts`). Immediate RPUSH follows; success marks the row
  `sent`. Redis-unavailable at start time is now recoverable (outbox retries),
  not terminal — the old refund-and-fail path for `QUEUE_UNAVAILABLE` was
  replaced because the durable record makes it unnecessary.
- `dispatchPendingOutbox()` (`src/lib/jobs.ts`) drains pending outbox rows.
- Worker loop runs its own dispatcher pass every `RECOVERY_INTERVAL_SECONDS`
  (default 60s) so a dead Next.js process never strands claimed jobs.

## 6. Worker changes (`worker/main.py`, `worker/app/reliability.py`)

- `claim_job()`: atomic exactly-once claim gated on `heartbeat_at IS NULL`
  and `attempt_count < MAX_JOB_ATTEMPTS`.
- Heartbeats every 30s during processing (including a background thread while
  long ffmpeg runs).
- Transient failure → job left `ANALYZING` with fresh pending outbox row
  (bounded retry). Permanent errors (`UNSUPPORTED_FORMAT`, `FILE_TOO_LARGE`,
  `INVALID_VIDEO`) skip retry and go straight to `FAILED` + refund.
- `recovery_pass()` (advisory-lock protected): terminal-fails exhausted stale
  jobs with bounded ledger refunds (`ATTEMPTS_EXHAUSTED`), requeues the rest
  through the outbox.
- Staleness thresholds scale with job type: images 10 min; videos
  `max(30 min, MAX_VIDEO_DURATION × (attempts+1))`.

## 7. Recovery mechanism

Worker-loop periodic pass, idempotent by construction (guarded UPDATEs +
staleness re-check under row lock + advisory lock). Re-running recovery twice
cannot double-refund or double-enqueue meaningfully (worker claim arbitrates).

## 8. Retry policy

`MAX_JOB_ATTEMPTS=3` (env-tunable). Rationale documented in the plan: covers
deploy-overlap crash loops and transient infra faults while bounding load
amplification; permanent media errors never retry.

## 9. Idempotency guarantees

- Job start: guarded `UPLOADING→ANALYZING` transition (existing, preserved)
- Credit deduction: single guarded UPDATE + `(job_id,'job_start')` unique index
- Refunds: `credits_refunded` ledger bounds total ≤ deducted, exactly-once
- Processing: `claim_job()` — only the winner runs; duplicates are dropped
- Video settlement: `reconcile_job_credits` guard makes repeats no-ops

## 10. Docker architecture

- `Dockerfile.web`: multi-stage Node 20 build → non-root runtime image
- `worker/Dockerfile`: python:3.12-slim + ffmpeg/libgl1, non-root
- `docker-compose.prod.yml` overlay adds web+worker with
  `restart: unless-stopped`, healthcheck-based startup ordering, service-name
  env defaults, `SESSION_SECRET` required (no default), tmp volume for worker
- Host port mapping **unchanged**: Postgres stays `5433:5432` (native Windows
  PG owns 5432). Containers use service names (`postgres:5432`, `redis:6379`,
  `minio:9000`) — never localhost.

## 11. Local development workflow

```
docker compose up -d     # postgres(:5433) + redis(:6379) + minio(:9000) + tooling
npm run dev              # Next.js on :3000 (host), talks to localhost:5433/6379/9000
```

Optionally also run the worker locally: `python -m worker` (needs host FFmpeg),
or use the prod overlay's worker service which needs no host Python/FFmpeg.

## 12. Production deployment workflow

```
set DATABASE_URL_DOCKER / REDIS_URL_DOCKER / S3_* / SESSION_SECRET as needed
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
docker compose logs -f            # all services
docker compose logs -f worker     # worker/recovery events
docker compose down
```

No production path uses `npm run dev`.

## 13. Environment configuration

All secrets via env vars; compose overlay requires `SESSION_SECRET` explicitly
(fails fast otherwise). Defaults point at compose service names. Nothing
committed contains credentials beyond the pre-existing dev-only MinIO/postgres
defaults that were already public in the repo.

## 14. Tests added

`worker/tests/test_reliability.py` (real PostgreSQL + real Redis):
1. claim is exactly-once (duplicate delivery loses)
2. claim respects the attempt cap
3. stale job recovery re-arms + redispatches via outbox (message verified end-to-end in Redis)
4. healthy long video with recent heartbeat is NOT reaped
5. exhausted attempts → FAILED + exact refund; second pass doesn't double-refund
6. duplicate refund attempts stay bounded
7. outbox dispatcher rebuilds queue message from DB; sent rows don't re-push

## 15. Test results

- `pytest worker/tests`: **20 passed** (7 reliability + 13 existing credit/ffmpeg/models) against real PG (5433) + Redis
- `tsc --noEmit`: pass · `next lint`: clean
- `vitest`: 19 passed (13 unit + 6 PG credit-integration)

## 16. Docker verification results

- `pakino-worker` image builds successfully (32s).
- `pakino-web` image build was run; first attempt hit a BuildKit cache error
  (read-only file system during COPY of node_modules); cache pruned and rebuild
  started — long npm ci/build on this machine. Verify with:
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

## 17. Remaining risks

1. Web-image build verification on this workstation was still running when this
   report was written; CI does not yet exercise Docker builds.
2. Single-host compose deployment has no HA story (by design, MVP).
3. Temp-file sweep after SIGKILL is OS-dependent; container tmp volume bounds it.
4. Recovery rides the worker loop — if NO worker runs at all, nothing recovers
   (acceptable: workers are part of every deployment shape; documented).
5. S3 multipart abort leftovers from crashed uploads await the retention reaper.

## 18. Manual operational requirements

- Set `SESSION_SECRET` (32+ random bytes) before any real deployment.
- Apply `drizzle/0002_job_reliability.sql` to existing databases.
- Monitor `docker compose logs -f worker` for `recovered`, `ATTEMPTS_EXHAUSTED`,
  `outbox dispatcher delivered` events.
