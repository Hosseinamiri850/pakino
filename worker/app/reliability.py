"""Job lifecycle SQL used by the worker: idempotent claiming, heartbeats,
stale-job recovery and bounded retries. All state transitions are single
guarded UPDATEs so concurrent workers/recovery passes stay correct.
"""
from __future__ import annotations

# Bounded retries: covers transient infra faults while bounding load
# amplification. See docs/JOB_RELIABILITY_PLAN.md.
DEFAULT_MAX_ATTEMPTS = 3


def claim_job(conn, job_id: str, max_attempts: int = DEFAULT_MAX_ATTEMPTS) -> bool:
    """Atomically claim a delivered message for processing.

    A job is claimable only while it sits in ANALYZING with NO live claim
    (`heartbeat_at IS NULL` — the state the API leaves after the outbox commit,
    or that recovery leaves after re-arming). The winning UPDATE sets
    heartbeat_at, which makes every duplicate delivery lose. attempt_count is
    incremented by the claim and gates reprocessing after recovery. The DB is
    the source of truth — no in-memory state involved. Caller commits on True.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE jobs
               SET attempt_count = attempt_count + 1,
                   heartbeat_at = now(),
                   started_at = COALESCE(started_at, now())
             WHERE id = %s
               AND status = 'ANALYZING'
               AND heartbeat_at IS NULL
               AND attempt_count < %s
            RETURNING id
            """,
            (job_id, max_attempts),
        )
        return cur.fetchone() is not None


def heartbeat(conn, job_id: str) -> None:
    """Refresh liveness for the recovery sweep. Cheap single UPDATE."""
    with conn.cursor() as cur:
        cur.execute("UPDATE jobs SET heartbeat_at = now() WHERE id = %s", (job_id,))


def stale_after_sql(job_type_col: str = "type", attempts_col: str = "attempt_count") -> str:
    """Per-type staleness threshold expression.

    Images are fast: 10 minutes without a heartbeat is dead. Videos legitimately
    run for MAX_VIDEO_DURATION; the threshold scales with the configured cap and
    the number of prior attempts so slow-but-alive jobs are never reaped.
    Values are injected via psycopg parameters at call sites; this only builds
    the column references (trusted identifiers, not user input).
    """
    return f"""
        CASE {job_type_col}
          WHEN 'video' THEN GREATEST(
              interval '30 minutes',
              (%s * interval '1 second') * ({attempts_col} + 1)
          )
          ELSE interval '10 minutes'
        END
    """


def find_stale_jobs(conn, max_video_duration_seconds: int, limit: int = 50) -> list[str]:
    """Jobs stuck in an active state past their staleness deadline."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id FROM jobs
             WHERE status IN ('ANALYZING', 'DETECTING', 'PROCESSING', 'ENCODING')
               AND COALESCE(heartbeat_at, started_at, created_at) < now() - {stale_after_sql()}
             LIMIT %s
            """,
            (max_video_duration_seconds, limit),
        )
        return [str(row[0]) for row in cur.fetchall()]


def recover_stale_job(conn, job_id: str, max_video_duration_seconds: int) -> str | None:
    """Re-arm one stale job for redelivery via the outbox.

    Re-checks staleness under the row lock, so two recovery passes racing on
    the same job produce exactly one winner (the loser sees the freshly
    re-armed row and returns None). Re-enqueue happens through the pending
    outbox path, so delivery remains at-least-once and the worker's next claim
    arbitrates duplicates. Caller commits when not None.
    Returns the status the job was recovered from, or None.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT status FROM jobs WHERE id = %s FOR UPDATE", (job_id,))
        row = cur.fetchone()
        if not row:
            return None
        status = row[0]
        if status not in ("ANALYZING", "DETECTING", "PROCESSING", "ENCODING"):
            return None
        cur.execute(
            f"""
            SELECT 1 FROM jobs
             WHERE id = %s
               AND COALESCE(heartbeat_at, started_at, created_at) < now() - {stale_after_sql()}
            """,
            (job_id, max_video_duration_seconds),
        )
        if cur.fetchone() is None:
            return None  # not actually stale anymore (already re-armed by another pass)
        # Keep attempt_count as-is: the next claim_job increments it, so the
        # MAX_JOB_ATTEMPTS gate is what decides retry vs final failure.
        cur.execute(
            """
            UPDATE jobs
               SET status = 'ANALYZING',
                   progress = 5,
                   heartbeat_at = NULL,
                   last_error_code = NULL
             WHERE id = %s
            """,
            (job_id,),
        )
        cur.execute(
            "INSERT INTO job_outbox (job_id) VALUES (%s)",
            (job_id,),
        )
        return status


def fail_exhausted_jobs(conn, max_attempts: int = DEFAULT_MAX_ATTEMPTS, limit: int = 50) -> list[str]:
    """Terminal-fail stale jobs that have consumed every attempt.

    Refunds go through refund_job_credits (ledger-bounded, exactly-once).
    Caller commits per job. Returns the failed job ids.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, user_id FROM jobs
             WHERE status IN ('ANALYZING', 'DETECTING', 'PROCESSING', 'ENCODING')
               AND attempt_count >= %s
               AND COALESCE(heartbeat_at, started_at, created_at) < now() - interval '30 minutes'
             LIMIT %s
             FOR UPDATE
            """,
            (max_attempts, limit),
        )
        rows = cur.fetchall()

    failed = []
    from .db import refund_job_credits  # local import avoids a cycle

    for job_id, user_id in rows:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                   SET status = 'FAILED',
                       progress = 100,
                       completed_at = now(),
                       error_code = 'ATTEMPTS_EXHAUSTED'
                 WHERE id = %s AND status IN ('ANALYZING', 'DETECTING', 'PROCESSING', 'ENCODING')
                """,
                (job_id,),
            )
        if user_id:
            try:
                refund_job_credits(conn, str(job_id), str(user_id))
            except Exception:
                raise
        failed.append(str(job_id))
    return failed


def dispatch_outbox(conn, r, queue_name: str, limit: int = 100) -> int:
    """Push pending outbox rows to Redis and mark them sent (at-least-once).

    A crash between RPUSH and marking 'sent' may deliver twice — safe because
    claim_job arbitrates. Returns the number of messages pushed.
    """
    import json

    with conn.cursor() as cur:
        cur.execute(
            "SELECT o.job_id FROM job_outbox o WHERE o.status = 'pending' ORDER BY o.created_at LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()
    pushed = 0
    for (job_id,) in rows:
        msg = _build_message(conn, str(job_id))
        if msg is None:
            # Job/file vanished (e.g. cascade delete); retire the record.
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE job_outbox SET status = 'dead', sent_at = now() WHERE job_id = %s AND status = 'pending'",
                    (job_id,),
                )
            continue
        r.rpush(queue_name, json.dumps(msg))
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE job_outbox SET status = 'sent', sent_at = now() WHERE job_id = %s AND status = 'pending'",
                (job_id,),
            )
            cur.execute("UPDATE jobs SET queued_at = now() WHERE id = %s", (job_id,))
        pushed += 1
    return pushed


def _build_message(conn, job_id: str) -> dict | None:
    """Reconstruct the queue message from DB state (used by the dispatcher)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT j.id::text, j.user_id::text, j.type, f.storage_key, f.original_filename,
                   f.mime_type, f.size_bytes, COALESCE(f.expires_at, now()), j.processing_backend
              FROM jobs j JOIN files f ON f.id = j.input_file_id
             WHERE j.id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    expires_at = row[7]
    epoch_ms = expires_at.timestamp() * 1000 if hasattr(expires_at, "timestamp") else float(expires_at)
    from .config import load_settings

    settings = load_settings()
    return {
        "job_id": row[0],
        "user_id": row[1],
        "type": row[2],
        "input_key": row[3],
        "input_filename": row[4],
        "mime_type": row[5],
        "size_bytes": row[6],
        "expires_at": epoch_ms,
        "processing_backend": row[8] or settings.processing_backend,
    }
