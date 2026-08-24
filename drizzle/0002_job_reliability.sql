-- Job & worker reliability hardening.
-- Run: psql $DATABASE_URL -f drizzle/0002_job_reliability.sql

-- Lifecycle metadata for retries, heartbeats and stale-job recovery.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_status_heartbeat
  ON jobs (status, COALESCE(heartbeat_at, started_at, created_at));

-- Transactional outbox: committed in the same DB transaction as the job claim
-- + credit deduction; a dispatcher pushes to Redis and marks the row sent.
-- Crash before push → row stays 'pending' → re-pushed later (at-least-once).
-- Crash after push but before marking → duplicate RPUSH possible; harmless
-- because the worker's DB claim is idempotent.
CREATE TABLE IF NOT EXISTS job_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_outbox_pending ON job_outbox (created_at) WHERE status = 'pending';
