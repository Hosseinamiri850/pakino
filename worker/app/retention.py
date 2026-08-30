"""Retention reaper: delete expired file objects from S3 and their DB rows.

files.expires_at is written at upload/output time; this pass enforces it.
Deletion order matters: S3 object first, then the row — a crash between the
two leaves an orphaned row (retried next pass, harmless) but never a live
object that looks deleted. Rows still referenced by jobs (input_file_id /
output_file_id) are skipped so job history keeps its FKs intact.
"""
from __future__ import annotations

import logging

log = logging.getLogger("pakino.reaper")


def reap_expired_files(conn, s3, bucket: str, batch_limit: int = 100) -> dict:
    """Delete up to batch_limit expired files. Returns counts for logging."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, storage_key FROM files
             WHERE expires_at IS NOT NULL
               AND expires_at < now()
               AND NOT EXISTS (
                    SELECT 1 FROM jobs j
                     WHERE j.input_file_id = files.id OR j.output_file_id = files.id
               )
             LIMIT %s
            """,
            (batch_limit,),
        )
        rows = cur.fetchall()

    deleted_objects = 0
    missing_objects = 0
    for file_id, storage_key in rows:
        try:
            s3.delete_object(Bucket=bucket, Key=storage_key)
            deleted_objects += 1
        except Exception:
            log.exception("failed to delete s3 object key=%s; keeping row for retry", storage_key)
            continue

        with conn.cursor() as cur:
            cur.execute("DELETE FROM files WHERE id = %s", (file_id,))
        conn.commit()

    if rows:
        log.info("reaped %d expired file(s) (objects deleted: %d)", len(rows), deleted_objects)
    return {"rows": len(rows), "objects_deleted": deleted_objects}


def retention_pass(settings) -> None:
    """Standalone reaper pass for the worker loop. Best-effort: any failure is
    logged and left to the next interval."""
    try:
        from .db import connect
        from .storage import make_s3_client

        conn = connect(settings)
        try:
            s3 = make_s3_client(settings)
            reap_expired_files(conn, s3, settings.s3_bucket)
        finally:
            conn.close()
    except Exception:
        log.exception("retention pass failed")
