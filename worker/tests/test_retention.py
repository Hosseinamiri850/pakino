"""Retention reaper tests — real PostgreSQL + real MinIO (or skips)."""
import os
import uuid

import psycopg
import pytest

from worker.app.retention import reap_expired_files

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://pakino:pakino@localhost:5433/pakino")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "http://localhost:9000")


def _pg_up() -> bool:
    try:
        psycopg.connect(DATABASE_URL, connect_timeout=3).close()
        return True
    except Exception:
        return False


def _s3_up() -> bool:
    try:
        import boto3
        from botocore.client import Config as BotoConfig

        s3 = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            region_name="us-east-1",
            aws_access_key_id="pakino",
            aws_secret_access_key="pakino12345",
            config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        s3.list_buckets()
        return True
    except Exception:
        return False


pytestmark = [
    pytest.mark.skipif(not _pg_up(), reason="PostgreSQL unreachable"),
    pytest.mark.skipif(not _s3_up(), reason="MinIO unreachable"),
]


def _conn():
    return psycopg.connect(DATABASE_URL, autocommit=False)


def test_expired_unreferenced_file_is_reaped():
    conn = _conn()
    with conn.cursor() as cur:
        cur.execute("SET lock_timeout = '5s'")
        cur.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, 'x') RETURNING id",
            (f"rr{uuid.uuid4().hex[:8]}@test.local",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO files (user_id, storage_key, original_filename, mime_type, size_bytes, expires_at)
            VALUES (%s, %s, 'old.png', 'image/png', 1, now() - interval '1 hour')
            RETURNING id
            """,
            (user_id, f"uploads/reap-test-{uuid.uuid4().hex[:8]}.png"),
        )
        file_id = str(cur.fetchone()[0])
    conn.commit()

    import boto3
    from botocore.client import Config as BotoConfig

    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id="pakino",
        aws_secret_access_key="pakino12345",
        config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    bucket = os.environ.get("S3_BUCKET", "pakino")
    key = None
    with conn.cursor() as cur:
        cur.execute("SELECT storage_key FROM files WHERE id = %s", (file_id,))
        key = cur.fetchone()[0]
    s3.put_object(Bucket=bucket, Key=key, Body=b"x")

    result = reap_expired_files(conn, s3, bucket)
    conn.commit()

    assert result["objects_deleted"] >= 1
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM files WHERE id = %s", (file_id,))
        assert cur.fetchone()[0] == 0

    # cleanup user
    with conn.cursor() as cur:
        cur.execute("DELETE FROM files WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    conn.close()


def test_referenced_expired_file_is_kept():
    conn = _conn()
    with conn.cursor() as cur:
        cur.execute("SET lock_timeout = '5s'")
        cur.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, 'x') RETURNING id",
            (f"rk{uuid.uuid4().hex[:8]}@test.local",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO files (user_id, storage_key, original_filename, mime_type, size_bytes, expires_at)
            VALUES (%s, %s, 'ref.png', 'image/png', 1, now() - interval '1 hour')
            RETURNING id
            """,
            (user_id, f"uploads/keep-test-{uuid.uuid4().hex[:8]}.png"),
        )
        file_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO jobs (user_id, type, status, input_file_id)
            VALUES (%s, 'image', 'COMPLETED', %s) RETURNING id
            """,
            (user_id, file_id),
        )
        job_id = cur.fetchone()[0]
    conn.commit()

    import boto3
    from botocore.client import Config as BotoConfig

    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id="pakino",
        aws_secret_access_key="pakino12345",
        config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    reap_expired_files(conn, s3, os.environ.get("S3_BUCKET", "pakino"))
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM files WHERE id = %s", (file_id,))
        assert cur.fetchone()[0] == 1  # referenced by a job — kept

    with conn.cursor() as cur:
        cur.execute("DELETE FROM jobs WHERE id = %s", (job_id,))
        cur.execute("DELETE FROM files WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    conn.close()
