import psycopg
from .config import Settings


def connect(settings: Settings) -> psycopg.Connection:
    return psycopg.connect(settings.database_url, autocommit=False)


def update_job(conn, job_id: str, **fields) -> None:
    cols = list(fields.keys())
    if not cols:
        return
    assigns = ", ".join(f"{c} = %s" for c in cols)
    values = [fields[c] for c in cols]
    values.append(job_id)
    with conn.cursor() as cur:
        cur.execute(f"UPDATE jobs SET {assigns} WHERE id = %s", values)


def insert_file(conn, user_id, storage_key: str, original_filename: str, mime_type: str, size_bytes: int, expires_at):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO files (user_id, storage_key, original_filename, mime_type, size_bytes, expires_at)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            (user_id, storage_key, original_filename, mime_type, size_bytes, expires_at),
        )
        return cur.fetchone()[0]


def refund_job_credits(conn, job_id: str, user_id: str, reason: str = "refund") -> int:
    """Refund the un-refunded remainder of a job's deducted credits.

    The guarded CTE locks the job row and flips credits_refunded to credits_used
    in one statement, so retried or concurrent refunds (e.g. a recovery run
    reprocessing a failure) return 0 the second time and the job's total refund
    can never exceed its deduction. Caller commits. Returns the refunded amount.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH remaining AS (
                SELECT id, credits_used - credits_refunded AS amount
                FROM jobs
                WHERE id = %s
                  AND credits_used IS NOT NULL
                  AND credits_refunded < credits_used
                FOR UPDATE
            )
            UPDATE jobs SET credits_refunded = jobs.credits_used
            FROM remaining
            WHERE jobs.id = remaining.id
            RETURNING remaining.amount
            """,
            (job_id,),
        )
        row = cur.fetchone()
        if not row:
            return 0
        amount = row[0]
        cur.execute("UPDATE users SET credits = credits + %s WHERE id = %s", (amount, user_id))
        cur.execute(
            "INSERT INTO credit_transactions (user_id, delta, reason, job_id) VALUES (%s, %s, %s, %s)",
            (user_id, amount, reason, job_id),
        )
        return amount


def reconcile_job_credits(conn, job_id: str, user_id: str, actual_cost: int, reason: str = "reconcile") -> int:
    """Video billing settlement: credits_used currently holds the max-duration
    reservation; settle it to the actual ffprobe-based cost and refund the
    difference through the same refund ledger. No-op when already settled or
    when a refund has already gone below the actual cost. Caller commits.
    Returns the refunded difference.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH target AS (
                SELECT id, credits_used, credits_refunded
                FROM jobs
                WHERE id = %s
                  AND credits_used IS NOT NULL
                  AND credits_used > %s
                  AND credits_refunded <= %s
                FOR UPDATE
            )
            UPDATE jobs j
               SET credits_refunded = t.credits_refunded + (t.credits_used - %s),
                   credits_used = %s
              FROM target t
             WHERE j.id = t.id
            RETURNING t.credits_used - %s
            """,
            (job_id, actual_cost, actual_cost, actual_cost, actual_cost, actual_cost),
        )
        row = cur.fetchone()
        if not row:
            return 0
        amount = row[0]
        cur.execute("UPDATE users SET credits = credits + %s WHERE id = %s", (amount, user_id))
        cur.execute(
            "INSERT INTO credit_transactions (user_id, delta, reason, job_id) VALUES (%s, %s, %s, %s)",
            (user_id, amount, reason, job_id),
        )
        return amount
