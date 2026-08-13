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


def refund_credits(conn, user_id: str, amount: int, job_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET credits = credits + %s WHERE id = %s", (amount, user_id))
        cur.execute(
            "INSERT INTO credit_transactions (user_id, delta, reason, job_id) VALUES (%s, %s, %s, %s)",
            (user_id, amount, "refund", job_id),
        )
