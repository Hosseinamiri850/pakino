"""Credit ledger functions in worker.app.db — run against a real PostgreSQL.

Skips when DATABASE_URL is unreachable (same contract as the TS integration
suite): the guarded-UPDATE semantics under test cannot be proven with mocks.
"""
import os
import uuid

import psycopg
import pytest

from worker.app.db import connect, refund_job_credits, reconcile_job_credits

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://pakino:pakino@localhost:5433/pakino")


def _db_up(url: str) -> bool:
    try:
        with psycopg.connect(url, connect_timeout=3):
            return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_up(DATABASE_URL), reason="PostgreSQL unreachable")


def _conn():
    return psycopg.connect(DATABASE_URL, autocommit=False)


@pytest.fixture()
def user_and_job():
    conn = _conn()
    with conn.cursor() as cur:
        email = f"t{uuid.uuid4().hex[:10]}@test.local"
        cur.execute(
            "INSERT INTO users (email, password_hash, credits) VALUES (%s, 'x', %s) RETURNING id",
            (email, 0),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO jobs (user_id, type, status, credits_used) VALUES (%s, 'image', 'ANALYZING', %s) RETURNING id",
            (user_id, 30),
        )
        job_id = str(cur.fetchone()[0])
    conn.commit()
    yield user_id, job_id
    with conn.cursor() as cur:
        cur.execute("DELETE FROM credit_transactions WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM jobs WHERE id = %s", (job_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    conn.close()


def _credits(user_id) -> int:
    c = _conn()
    with c.cursor() as cur:
        cur.execute("SELECT credits FROM users WHERE id = %s", (user_id,))
        v = cur.fetchone()[0]
    c.close()
    return v


def _job(job_id):
    c = _conn()
    with c.cursor() as cur:
        cur.execute("SELECT credits_used, credits_refunded FROM jobs WHERE id = %s", (job_id,))
        row = cur.fetchone()
    c.close()
    return row


def test_refund_is_exact(user_and_job):
    user_id, job_id = user_and_job
    conn = _conn()
    refunded = refund_job_credits(conn, job_id, user_id)
    conn.commit()
    assert refunded == 30
    assert _credits(user_id) == 30
    assert _job(job_id) == (30, 30)
    conn.close()


def test_duplicate_refund_returns_zero(user_and_job):
    user_id, job_id = user_and_job
    conn = _conn()
    assert refund_job_credits(conn, job_id, user_id) == 30
    conn.commit()
    # Simulates a recovery run reprocessing the same failure.
    assert refund_job_credits(conn, job_id, user_id) == 0
    conn.commit()
    assert _credits(user_id) == 30
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM credit_transactions WHERE job_id = %s AND reason = 'refund'", (job_id,))
        assert cur.fetchone()[0] == 1
    conn.close()


def test_refund_never_exceeds_deduction(user_and_job):
    user_id, job_id = user_and_job
    conn = _conn()
    with conn.cursor() as cur:
        cur.execute("UPDATE jobs SET credits_refunded = credits_used WHERE id = %s", (job_id,))
    conn.commit()
    assert refund_job_credits(conn, job_id, user_id) == 0
    assert _credits(user_id) == 0
    conn.close()


def test_reconcile_settles_reservation_to_actual_cost(user_and_job):
    user_id, job_id = user_and_job
    conn = _conn()
    # Reservation is 30; ffprobe says the video is 12 seconds -> actual cost 20
    # at 10 credits per 10 seconds. Difference refunds immediately.
    refunded = reconcile_job_credits(conn, job_id, user_id, actual_cost=20)
    conn.commit()
    assert refunded == 10
    used, refunded_col = _job(job_id)
    assert used == 20 and refunded_col == 10
    assert _credits(user_id) == 10

    # Second settle call (retry) is a no-op.
    assert reconcile_job_credits(conn, job_id, user_id, actual_cost=20) == 0
    assert _credits(user_id) == 10
    conn.close()


def test_reconcile_skips_when_already_at_or_below_actual(user_and_job):
    user_id, job_id = user_and_job
    conn = _conn()
    # A failure refund has already paid back below the actual cost: settlement
    # must not claw anything back or re-raise the reservation.
    with conn.cursor() as cur:
        cur.execute("UPDATE jobs SET credits_refunded = 25 WHERE id = %s", (job_id,))
    conn.commit()
    assert reconcile_job_credits(conn, job_id, user_id, actual_cost=20) == 0
    used, refunded = _job(job_id)
    assert used == 30 and refunded == 25
    conn.close()


def test_worker_main_refund_uses_ledger():
    # Source-level guard: process_one must refund through the job ledger, never
    # a fixed per-type amount. Read the file instead of importing so the check
    # runs even without optional deps (boto3 etc.) installed.
    from pathlib import Path

    src = (Path(__file__).resolve().parent.parent / "main.py").read_text(encoding="utf-8")
    assert "refund_credits(conn, msg.user_id, settings.credits_per_image" not in src
    assert "refund_job_credits" in src
