# Job & Worker Reliability Audit

Audit of every failure window in the current pipeline (commit `1b9bc45`).
Source of truth: the code as it exists today — not documentation.

## Pipeline today

```
POST /api/jobs
  → guarded claim UPLOADING→ANALYZING        src/app/api/jobs/route.ts
  → atomic credit deduction (ledger row)     src/lib/credits.ts deductCredits
  → RPUSH pakino:jobs                        src/lib/queue/index.ts enqueueJob
Python worker
  → BRPOP (destructive read, no ACK)         worker/app/queue.py brpop_job
  → status updates ANALYZING→DETECTING→PROCESSING→ENCODING→COMPLETED
  → failure → FAILED + bounded ledger refund worker/app/db.py refund_job_credits
```

No recovery process exists. No heartbeat, attempt counter, or queued timestamp
exists in the schema. Redis runs with persistence disabled (`--save ""`,
`--appendonly no`). There are no Docker images for Next.js or the worker.

## Failure windows

### CASE A — crash between claim/deduction and enqueue

Window: after the guarded `UPDATE jobs SET status='ANALYZING'` commits and the
credit transaction commits, but before/at `enqueueExistingJob` → RPUSH.

Resulting DB state: job stuck in `ANALYZING`, progress 5, `credits_used`
reserved, one `job_start` ledger row. The queue has no message.

Today: permanent. Credits are locked forever; the client polls a job that will
never change. **User's credits are effectively lost** unless the API process
survives to execute the existing `catch` around `enqueueExistingJob` — which
only covers an *observed* Redis error, not a process crash.

Severity: critical (money). Must be fixed by a durable pending-work record so a
later dispatcher/recovery pass can re-enqueue.

Note: the window is small (one await between two local services), but it is a
real production incident class: deploy restarts, OOM kills, Redis connection
drops at exactly that instant.

### CASE B — crash after enqueue

After RPUSH succeeds and before/without any further action: the message is in
Redis; if Redis persists it, the worker picks the job up on next start and
processes normally. If Redis loses the list (current config: it does), we fall
back to CASE A state.

The job can safely continue **only if** (a) Redis is durable or (b) recovery can
re-enqueue from DB state. Today neither holds → same outcome as CASE A whenever
Redis restarts.

### CASE C — worker crash after BRPOP

`BRPOP` destructively removes the message before the worker does anything with
it. A crash anywhere between BRPOP and the first committed DB update leaves:

- queue: empty (message consumed)
- job row: still `ANALYZING` (the worker sets `ANALYZING`/progress 10 only after
  download begins — actually the first update happens inside `process_one`; if
  the crash is before that, status remains whatever POST /api/jobs left:
  `ANALYZING` @5)
- credits: deducted, never refunded
- temp files: none yet (or leaked `TemporaryDirectory` contents if mid-download;
  on POSIX these are cleaned by the OS eventually, on Windows they may linger)

Today: message lost permanently, job stuck, credits lost. Severity: critical.
This is the classic at-most-once delivery problem; must move to at-least-once +
idempotent processing.

### CASE D — worker crash during PROCESSING

Crash mid-`process_one` (ffmpeg/remove-ai-watermarks/S3):

- job status: whatever was last committed (`DETECTING`/`PROCESSING`/`ENCODING`)
- credits: deducted, no refund executed (refund path lives in the same process)
- temp files: `TemporaryDirectory` cleanup skipped on hard kill (SIGKILL/OOM);
  leaked under the container's `/tmp`
- output files: possibly partially written locally; S3 upload either did not
  happen or completed atomically (boto3 multipart completes all-or-nothing for
  our sizes); `outputs/{job_id}.ext` in S3 without a COMPLETED job row is orphaned
- retry behavior: none. No requeue exists.

Today: stuck job + lost credits + leaked temp files. Severity: critical.

### CASE E — duplicate delivery

If the same job message were delivered twice (e.g. after adding retries/recovery,
which this phase does), the current worker would:

- process twice (CPU burn, second S3 upload overwrites the first — benign since
  deterministic key, but racy)
- call `update_job(... status='COMPLETED')` twice — benign
- NOT double-deduct (deduction only happens in POST /api/jobs behind a guarded
  transition — safe)
- refund path: safe — `refund_job_credits` is ledger-guarded exactly-once

So credit safety already survives duplicates; **processing idempotency does not
exist** (no claim step in the worker). Duplicate concurrent execution could also
interleave status writes (e.g. one sets COMPLETED while other sets ENCODING).

### CASE F — server restart (all processes)

PostgreSQL survives (durable volume). Redis: currently configured WITHOUT
persistence — queued messages are lost on restart. Next.js restarts: harmless
(stateless). Worker restarts: loses its in-flight job (CASE D).

Job states after a full restart today:

| Status | Outcome |
|---|---|
| UPLOADING | fine — user can start it (claim-first flow intact) |
| ANALYZING (pre-enqueue crash or lost message) | stuck forever |
| ANALYZING/PROCESSING/ENCODING (worker died) | stuck forever |
| FAILED / COMPLETED | terminal, correct |

### CASE G — Redis restart

With `--save "" --appendonly no`: every queued message is destroyed. Since the
queue is the only handoff mechanism and there is no outbox/recovery, queued work
is lost. Requirement: either enable Redis persistence (AOF) AND treat it as
durability-critical, or make Redis a best-effort transport whose durability is
guaranteed by the database (chosen design, see PLAN). The chosen design keeps
Redis non-durable on purpose and makes the DB the source of truth.

### CASE H — long-running jobs vs dead workers

A 300s video legitimately sits in PROCESSING for minutes. There is no heartbeat
and no deadline metadata, so nothing distinguishes "still working" from "worker
died". Any recovery based on elapsed-time alone would need a generous constant
and would falsely kill slow-but-alive jobs, or wait too long for dead ones.
Requirement: periodic DB heartbeat from the worker + per-attempt deadline.

## Additional observations

- `_error_code` maps exceptions heuristically; `INVALID_VIDEO`/`UNSUPPORTED_FORMAT`
  style errors are PERMANENT — retrying them can never succeed. There is no
  distinction today because there is no retry at all.
- `brpop_job(timeout=5)` loops make graceful shutdown work; SIGKILL (OOM) skips
  cleanup — acceptable once recovery exists.
- The worker opens a fresh S3 client per job (`make_s3_client` in `process_one`);
  wasteful but not a reliability bug.
- `is_cancelled` reads a Redis key set by `cancelJob` which no route calls yet —
  cancellation plumbing exists but is unused; recovery must respect it.
