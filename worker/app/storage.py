import boto3
from botocore.client import Config as BotoConfig
from .config import Settings


def make_s3_client(settings: Settings):
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def download_to_file(s3, bucket: str, key: str, dest_path: str) -> None:
    s3.download_file(bucket, key, dest_path)


def upload_file(s3, bucket: str, path: str, key: str, content_type: str | None = None) -> None:
    extra = {"ContentType": content_type} if content_type else {}
    s3.upload_file(path, bucket, key, ExtraArgs=extra)
