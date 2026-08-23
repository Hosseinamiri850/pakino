-- Credit system hardening.
-- Run: psql $DATABASE_URL -f drizzle/0001_credit_hardening.sql

-- Per-job refund ledger. refund_job_credits()/reconcile_job_credits() in the
-- worker advance this with an atomic guarded UPDATE, so a job's total refund
-- can never exceed credits_used and a refund can never apply twice, even if
-- the worker crashes and a retry reprocesses the failure.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS credits_refunded INTEGER NOT NULL DEFAULT 0;

-- At most one successful deduction per job (reason='job_start') and at most
-- one refund / reconciliation transaction per job per reason. Partial index:
-- job-scoped rows only (job_id IS NOT NULL); wallet rows keep NULL job_id.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_job_reason_uq
  ON credit_transactions (job_id, reason)
  WHERE job_id IS NOT NULL;
