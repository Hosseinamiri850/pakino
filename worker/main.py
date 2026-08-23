"""Pakino processing worker. Consumes Redis jobs, processes media with
remove-ai-watermarks + FFmpeg, uploads results to S3, updates PostgreSQL.
Run: python -m worker (project root) — or `python worker/main.py`.
"""
from __future__ import annotations

import argparse
import logging
import math
import os
import signal
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from worker.app.config import load_settings
from worker.app.queue import make_redis, brpop_job, is_cancelled
from worker.app.storage import make_s3_client, download_to_file, upload_file
from worker.app.db import connect, update_job, insert_file, refund_job_credits, reconcile_job_credits
from worker.app.models import JobMessage
from worker.app import image as image_proc
from worker.app import video as video_proc

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pakino.worker")

_MIME_EXT = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
}


def _ext_for(mime: str, name: str) -> str:
    ext = Path(name).suffix.lstrip(".").lower()
    if ext:
        return ext
    return _MIME_EXT.get(mime, "bin")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def process_one(msg: JobMessage, settings) -> None:
    s3 = make_s3_client(settings)
    conn = connect(settings)
    try:
        update_job(conn, msg.job_id, status="ANALYZING", progress=10, started_at=_now())
        conn.commit()

        with tempfile.TemporaryDirectory() as tmpdir:
            in_ext = _ext_for(msg.mime_type, msg.input_filename)
            input_path = str(Path(tmpdir) / f"in.{in_ext}")
            download_to_file(s3, settings.s3_bucket, msg.input_key, input_path)

            if is_cancelled(make_redis(settings), msg.job_id):
                # Policy: cancellation refunds the un-refunded remainder.
                refund_job_credits(conn, msg.job_id, msg.user_id)
                update_job(conn, msg.job_id, status="CANCELLED", progress=0)
                conn.commit()
                return

            if msg.type == "video" and msg.user_id:
                # Video billing settlement: the API reserved credits for
                # MAX_VIDEO_DURATION; settle to the actual ffprobe duration and
                # refund the difference now (docs/billing.md). Unknown duration
                # (<= 0) keeps the reservation until the failure refund settles it.
                duration = video_proc.probe_duration(input_path)
                if duration > 0:
                    actual = math.ceil(duration / 10) * settings.credits_per_video_10s
                    refunded = reconcile_job_credits(conn, msg.job_id, msg.user_id, actual)
                    if refunded:
                        log.info("job %s settled to %d credits, refunded %d", msg.job_id, actual, refunded)
                    conn.commit()

            update_job(conn, msg.job_id, status="DETECTING", progress=25)
            conn.commit()

            out_ext = in_ext if msg.type == "video" else in_ext
            if msg.type == "video" and out_ext not in ("mp4", "mov", "webm"):
                out_ext = "mp4"
            output_path = str(Path(tmpdir) / f"out.{out_ext}")

            update_job(conn, msg.job_id, status="PROCESSING", progress=40)
            conn.commit()

            if msg.type == "image":
                result = image_proc.process_image(input_path, output_path)
            else:
                result = video_proc.process_video(input_path, output_path, settings.max_video_duration)

            if result.get("no_watermark"):
                # Policy: no output was produced, so the user pays nothing —
                # refund the un-refunded remainder.
                refund_job_credits(conn, msg.job_id, msg.user_id)
                update_job(
                    conn, msg.job_id,
                    status="COMPLETED", progress=100, completed_at=_now(),
                    provider=None, error_code="NO_WATERMARK_DETECTED",
                )
                conn.commit()
                return

            out_size = os.path.getsize(output_path)
            update_job(conn, msg.job_id, status="ENCODING", progress=80, output_size=out_size)
            conn.commit()

            out_key = f"outputs/{msg.job_id}.{out_ext}"
            ct = msg.mime_type if msg.type == "image" else f"video/{out_ext}"
            upload_file(s3, settings.s3_bucket, output_path, out_key, ct)

            expires_at = _now() + timedelta(hours=settings.file_retention_hours)
            file_id = insert_file(conn, msg.user_id, out_key, msg.input_filename, ct, out_size, expires_at)
            update_job(
                conn, msg.job_id,
                status="COMPLETED", progress=100, completed_at=_now(),
                output_file_id=file_id,
                provider=result.get("provider"),
                watermark_type="visible",
                confidence=result.get("confidence"),
                location=result.get("location"),
                duration_seconds=result.get("duration"),
                output_size=out_size,
            )
            conn.commit()
    except Exception as e:
        log.exception("job %s failed", msg.job_id)
        conn.rollback()
        update_job(
            conn, msg.job_id,
            status="FAILED", progress=100, completed_at=_now(),
            error_code=_error_code(e),
            error_message=str(e)[:500],
        )
        conn.commit()
        if msg.user_id:
            try:
                # Refund the un-refunded remainder of what was actually deducted
                # (jobs.credits_used); exactly-once via the refund ledger even if
                # a recovery run reprocesses this failure.
                refunded = refund_job_credits(conn, msg.job_id, msg.user_id)
                conn.commit()
                if refunded:
                    log.info("job %s refunded %d credits after failure", msg.job_id, refunded)
            except Exception:
                conn.rollback()
                log.exception("refund failed")
    finally:
        conn.close()


_ERROR_MAP = (
    ("FILE_TOO_LARGE", "too large"),
    ("UNSUPPORTED_FORMAT", "unsupported"),
    ("INVALID_VIDEO", "invalid video"),
    ("NO_WATERMARK_DETECTED", "no watermark"),
    ("WORKER_TIMEOUT", "timeout"),
)


def _error_code(e: Exception) -> str:
    msg = str(e).lower()
    for code, needle in _ERROR_MAP:
        if needle in msg:
            return code
    return "PROCESSING_FAILED"


def main() -> int:
    parser = argparse.ArgumentParser(description="Pakino worker")
    parser.add_argument("--once", action="store_true", help="process one job then exit")
    args = parser.parse_args()

    settings = load_settings()
    r = make_redis(settings)
    stop = {"flag": False}

    def handler(signum, _frame):
        log.info("received signal %s, stopping", signum)
        stop["flag"] = True

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)

    log.info("worker started, queue=%s", settings.queue_name)
    while not stop["flag"]:
        job = brpop_job(r, settings.queue_name, timeout=5)
        if job is None:
            if args.once:
                return 0
            continue
        try:
            msg = JobMessage.from_dict(job)
        except KeyError as e:
            log.error("malformed job message: %s", e)
            continue
        log.info("picked job %s type=%s", msg.job_id, msg.type)
        process_one(msg, settings)
    log.info("worker exited")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
