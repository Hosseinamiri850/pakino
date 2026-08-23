from __future__ import annotations

import logging
from pathlib import Path

from . import ffmpeg, watermark
from .models import SUPPORTED_VIDEO_PROVIDERS

log = logging.getLogger("pakino.video")


def probe_duration(input_path: str) -> float:
    """Actual duration via ffprobe — used for billing settlement before processing."""
    return ffmpeg.duration_seconds(input_path)


def process_video(input_path: str, output_path: str, max_duration: int) -> dict:
    """Detect + remove visible watermark on a video, preserving audio."""
    duration = ffmpeg.duration_seconds(input_path)
    if max_duration and duration > max_duration:
        raise ValueError("INVALID_VIDEO duration exceeds limit")

    try:
        detect = watermark.detect_video(input_path)
    except watermark.NoWatermarkError:
        # Still run remove_video_all -> passthrough copy so user gets their file back; flag no watermark.
        ffmpeg.encode_copy(input_path, output_path)
        return {"provider": None, "confidence": None, "location": None, "no_watermark": True, "duration": duration}

    provider = (detect.get("provider") or "").lower()
    mark = provider if provider in SUPPORTED_VIDEO_PROVIDERS else None
    res = watermark.remove_video_visible(input_path, output_path, mark=mark)
    final_provider = res.get("provider") or provider
    return {
        "provider": final_provider,
        "confidence": detect.get("confidence"),
        "location": detect.get("location"),
        "no_watermark": False,
        "duration": duration,
    }
