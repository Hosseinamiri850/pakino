"""Pakino processing worker. Consumes Redis jobs, processes media with
remove-ai-watermarks + FFmpeg, uploads results to S3, updates PostgreSQL.

Reliability model (docs/JOB_RELIABILITY_PLAN.md):
- at-least-once delivery: the DB outbox re-drives any job whose queue message
  was lost; duplicate delivery is neutralized by an atomic DB claim
- heartbeats distinguish long-running jobs from dead workers
- a periodic recovery pass requeues stale jobs and terminal-fails exhausted ones
- refunds stay exactly-once via the credit ledger (worker/app/db.py)
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
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from worker.app.config import load_settings
from worker.app.queue import make_redis, brpop_job, is_cancelled
from worker.app.storage import make_s3_client, download_to_file, upload_file
from worker.app.db import connect, update_job, insert_file, refund_job_credits, reconcile_job_credits
from worker.app.models import JobMessage
from worker.app import reliability
from worker.app.retention import retention_pass
from worker.app import image as image_proc
from worker.app import video as video_proc

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pakino.worker")

_MIME_EXT = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
}

# Errors that can never succeed on retry. Anything else (or an unclassified
# crash) is treated as transient by recovery.
PERMANENT_ERROR_CODES = {"UNSUPPORTED_FORMAT", "FILE_TOO_LARGE", "INVALID_VIDEO"}

HEARTBEAT_SECONDS = 30


def _ext_for(mime: str, name: str) -> str:
    ext = Path(name).suffix.lstrip(".").lower()
    if ext:
        return ext
    return _MIME_EXT.get(mime, "bin")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _error_code(e: Exception) -> str:
    msg = str(e).lower()
    for code, needle in (
        ("FILE_TOO_LARGE", "too large"),
        ("UNSUPPORTED_FORMAT", "unsupported"),
        ("INVALID_VIDEO", "invalid video"),
        ("NO_WATERMARK_DETECTED", "no watermark"),
        ("WORKER_TIMEOUT", "timeout"),
    ):
        if needle in msg:
            return code
    return "PROCESSING_FAILED"


def process_one(msg: JobMessage, settings) -> None:
    """Process one claimed job. The caller must have won reliability.claim_job."""
    max_attempts = settings.max_job_attempts
    s3 = make_s3_client(settings)
    conn = connect(settings)
    try:
        update_job(conn, msg.job_id, status="ANALYZING", progress=10, started_at=_now(), heartbeat_at=_now())
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
                # refund the difference now (docs/billing.md).
                duration = video_proc.probe_duration(input_path)
                if duration > 0:
                    actual = math.ceil(duration / 10) * settings.credits_per_video_10s
                    refunded = reconcile_job_credits(conn, msg.job_id, msg.user_id, actual)
                    if refunded:
                        log.info("job %s settled to %d credits, refunded %d", msg.job_id, actual, refunded)
                    conn.commit()

            update_job(conn, msg.job_id, status="DETECTING", progress=25, heartbeat_at=_now())
            conn.commit()

            out_ext = in_ext
            if msg.type == "video" and out_ext not in ("mp4", "mov", "webm"):
                out_ext = "mp4"
            output_path = str(Path(tmpdir) / f"out.{out_ext}")

            update_job(conn, msg.job_id, status="PROCESSING", progress=40, heartbeat_at=_now())
            conn.commit()

            if msg.type == "image":
                result = image_proc.process_image(input_path, output_path)
            else:
                # Long videos must keep beating while ffmpeg runs.
                import threading

                stop_beat = {"flag": False}

                def beat_loop():
                    while not stop_beat["flag"]:
                        time.sleep(HEARTBEAT_SECONDS)
                        if stop_beat["flag"]:
                            return
                        try:
                            reliability.heartbeat(conn, msg.job_id)
                            conn.commit()
                        except Exception:
                            log.exception("heartbeat failed for job %s", msg.job_id)

                beater = threading.Thread(target=beat_loop, daemon=True)
                beater.start()
                try:
                    result = video_proc.process_video(input_path, output_path, settings.max_video_duration)
                finally:
                    stop_beat["flag"] = True
                    beater.join(timeout=2)

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
            update_job(conn, msg.job_id, status="ENCODING", progress=80, output_size=out_size, heartbeat_at=_now())
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
        code = _error_code(e)
        permanent = code in PERMANENT_ERROR_CODES
        will_retry = not permanent and _attempts_used(conn, msg.job_id) < max_attempts
        if will_retry:
            # Leave the job recoverable: recovery pass requeues via the outbox.
            # Mark the transient failure so operators can see it immediately.
            try:
                update_job(
                    conn, msg.job_id,
                    status="ANALYZING", progress=5,
                    heartbeat_at=None,
                    last_error_code=code,
                )
                conn.commit()
                _requeue_via_outbox(conn, msg.job_id)
                conn.commit()
                log.info("job %s failed transiently (%s), requeued for retry", msg.job_id, code)
                return
            except Exception:
                conn.rollback()
                log.exception("retry requeue failed for %s; falling back to FAILED", msg.job_id)
        update_job(
            conn, msg.job_id,
            status="FAILED", progress=100, completed_at=_now(),
            error_code=code if permanent else "ATTEMPTS_EXHAUSTED",
            error_message=str(e)[:500],
            last_error_code=code,
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


def _attempts_used(conn, job_id: str) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT attempt_count FROM jobs WHERE id = %s", (job_id,))
        row = cur.fetchone()
        return int(row[0]) if row else 0


def _requeue_via_outbox(conn, job_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE job_outbox SET status='sent', sent_at=now() WHERE job_id=%s AND status='pending'",
            (job_id,),
        )
        cur.execute("INSERT INTO job_outbox (job_id) VALUES (%s)", (job_id,))


def recovery_pass(r, settings) -> None:
    """Stale-job sweep: bounded retries then terminal failure with refund.

    Idempotent by construction — every transition is a guarded UPDATE and the
    advisory lock keeps concurrent workers from duplicating work.
    """
    conn = connect(settings)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(918273645)")
            got_lock = cur.fetchone()[0]
        if not got_lock:
            return

        # 1. Terminal-fail jobs that exhausted attempts (before requeueing more).
        for job_id in reliability.fail_exhausted_jobs(conn, settings.max_job_attempts):
            conn.commit()
            log.warning("job %s marked FAILED after exhausting attempts; remainder refunded", job_id)

        # 2. Requeue stale-but-recoverable jobs through the outbox.
        for job_id in reliability.find_stale_jobs(conn, settings.max_video_duration):
            from_status = reliability.recover_stale_job(conn, job_id, settings.max_video_duration)
            if from_status is None:
                continue
            conn.commit()
            pushed = reliability.dispatch_outbox(conn, r, settings.queue_name, limit=10)
            conn.commit()
            log.info("job %s recovered from %s, redelivered=%d", job_id, from_status, pushed)
    except Exception:
        conn.rollback()
        log.exception("recovery pass failed")
    finally:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(918273645)")
            conn.commit()
        except Exception:
            pass
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Pakino worker")
    parser.add_argument("--once", action="store_true", help="process one job then exit")
    args = parser.parse_args()

    settings = load_settings()
    r = make_redis(settings)
    stop = {"flag": False}
    last_recovery = 0.0

    def handler(signum, _frame):
        log.info("received signal %s, stopping", signum)
        stop["flag"] = True

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)

    log.info(
        "worker started, queue=%s max_attempts=%d",
        settings.queue_name,
        settings.max_job_attempts,
    )
    while not stop["flag"]:
        # Periodic housekeeping: heal lost messages + reap stale jobs.
        now = time.monotonic()
        if now - last_recovery > settings.recovery_interval_seconds:
            last_recovery = now
            try:
                conn = connect(settings)
                try:
                    pushed = reliability.dispatch_outbox(conn, r, settings.queue_name)
                    conn.commit()
                    if pushed:
                        log.info("outbox dispatcher delivered %d pending job(s)", pushed)
                finally:
                    conn.close()
            except Exception:
                log.exception("outbox dispatch pass failed")
            recovery_pass(r, settings)
            retention_pass(settings)

        job = brpop_job(r, settings.queue_name, timeout=5)
        if job is None:
            if args.once:
                return 0
            continue
        try:
            msg = JobMessage.from_dict(job)
        except KeyError as e:
            log.error("malformed job message dropped: %s", e)
            continue

        conn = connect(settings)
        try:
            claimed = reliability.claim_job(conn, str(msg.job_id), settings.max_job_attempts)
            conn.commit()
        except Exception:
            conn.rollback()
            log.exception("claim check failed for job %s; message dropped", msg.job_id)
            claimed = False
        finally:
            conn.close()
        if not claimed:
            log.info("job %s not claimable (duplicate delivery or exhausted); dropping message", msg.job_id)
            continue

        log.info("picked job %s type=%s", msg.job_id, msg.type)
        process_one(msg, settings)
    log.info("worker exited")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
