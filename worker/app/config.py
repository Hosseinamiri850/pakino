import os
from dataclasses import dataclass


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    database_url: str
    redis_url: str
    queue_name: str
    s3_endpoint: str
    s3_region: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str
    max_image_size: int
    max_video_size: int
    max_video_duration: int
    file_retention_hours: int
    credits_per_image: int
    credits_per_video_10s: int
    worker_concurrency: int
    processing_backend: str
    max_job_attempts: int
    recovery_interval_seconds: int

    @property
    def storage_opts(self) -> dict:
        return {
            "endpoint_url": self.s3_endpoint,
            "region_name": self.s3_region,
            "aws_access_key_id": self.s3_access_key,
            "aws_secret_access_key": self.s3_secret_key,
        }


def load_settings() -> Settings:
    return Settings(
        database_url=_env("DATABASE_URL", "postgres://pakino:pakino@localhost:5432/pakino"),
        redis_url=_env("REDIS_URL", "redis://localhost:6379"),
        queue_name=_env("QUEUE_NAME", "pakino:jobs"),
        s3_endpoint=_env("S3_ENDPOINT", "http://localhost:9000"),
        s3_region=_env("S3_REGION", "us-east-1"),
        s3_access_key=_env("S3_ACCESS_KEY", ""),
        s3_secret_key=_env("S3_SECRET_KEY", ""),
        s3_bucket=_env("S3_BUCKET", "pakino"),
        max_image_size=_int("MAX_IMAGE_SIZE", 10_485_760),
        max_video_size=_int("MAX_VIDEO_SIZE", 524_288_000),
        max_video_duration=_int("MAX_VIDEO_DURATION", 300),
        file_retention_hours=_int("FILE_RETENTION_HOURS", 24),
        credits_per_image=_int("CREDITS_PER_IMAGE", 5),
        credits_per_video_10s=_int("CREDITS_PER_VIDEO_10_SECONDS", 10),
        worker_concurrency=_int("WORKER_CONCURRENCY", 2),
        processing_backend=_env("PROCESSING_BACKEND", "opencv"),
        max_job_attempts=_int("MAX_JOB_ATTEMPTS", 3),
        recovery_interval_seconds=_int("RECOVERY_INTERVAL_SECONDS", 60),
    )
