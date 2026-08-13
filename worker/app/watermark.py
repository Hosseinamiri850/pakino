"""Thin wrappers over remove-ai-watermarks (imported as raiw).

Visible-watermark removal is CPU-friendly and needs only the [visible]/[video]
extras. The invisible path requires CUDA and is intentionally NOT used in the
MVP worker (would need a GPU host + the [qwen-zimage] extra).
"""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("pakino.watermark")

try:
    import remove_ai_watermarks as raiw  # type: ignore
    _RAIW_AVAILABLE = True
except Exception as e:  # pragma: no cover - env dependent
    log.warning("remove_ai_watermarks not available: %s", e)
    raiw = None  # type: ignore
    _RAIW_AVAILABLE = False


class NoWatermarkError(Exception):
    pass


class UnsupportedWatermarkError(Exception):
    pass


def lib_ready() -> bool:
    return _RAIW_AVAILABLE


def detect_image(input_path: str) -> dict:
    """Identify the visible provider mark in an image. Raises NoWatermarkError if none."""
    if not _RAIW_AVAILABLE:
        raise UnsupportedWatermarkError("library missing")
    info = raiw.identify(input_path)  # may return provenance dict / object
    return _normalize_identify(info)


def detect_video(input_path: str) -> dict:
    if not _RAIW_AVAILABLE:
        raise UnsupportedWatermarkError("library missing")
    info = raiw.identify_video(input_path)
    return _normalize_identify(info)


def remove_image_visible(input_path: str, output_path: str) -> dict:
    if not _RAIW_AVAILABLE:
        raise UnsupportedWatermarkError("library missing")
    result, removed = raiw.remove_visible(input_path, output_path)
    return {"result": result, "removed": removed}


def remove_video_visible(
    input_path: str, output_path: str, mark: str | None = None
) -> dict:
    if not _RAIW_AVAILABLE:
        raise UnsupportedWatermarkError("library missing")
    if mark:
        out = raiw.remove_video_visible(input_path, output_path, mark=mark)
    else:
        out = raiw.remove_video_all(input_path, output_path)
    provider = getattr(out, "mark", None) if out is not None else None
    return {"provider": provider, "output": output_path}


def _normalize_identify(info) -> dict:
    """Best-effort coerce the library's identify result into a stable dict."""
    if info is None:
        raise NoWatermarkError("no signal")
    if isinstance(info, dict):
        provider = info.get("mark") or info.get("provider") or info.get("name")
        conf = info.get("confidence") or info.get("score")
        loc = info.get("location") or info.get("region")
        if not provider:
            raise NoWatermarkError("provider unknown")
        return {"provider": str(provider), "confidence": float(conf) if conf else None, "location": str(loc) if loc else None}
    # object with attributes
    provider = getattr(info, "mark", None) or getattr(info, "name", None) or getattr(info, "provider", None)
    if not provider:
        raise NoWatermarkError("provider unknown")
    conf = getattr(info, "confidence", None) or getattr(info, "score", None)
    loc = getattr(info, "location", None) or getattr(info, "region", None)
    return {"provider": str(provider), "confidence": float(conf) if conf else None, "location": str(loc) if loc else None}
