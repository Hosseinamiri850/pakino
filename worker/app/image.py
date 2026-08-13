from __future__ import annotations

import logging
from pathlib import Path

from . import watermark

log = logging.getLogger("pakino.image")


def process_image(input_path: str, output_path: str) -> dict:
    """Detect then remove a visible watermark on a single image."""
    detect = {}
    try:
        detect = watermark.detect_image(input_path)
    except watermark.NoWatermarkError:
        # Per spec: do not pretend removal is possible. Surface as completed-with-no-output.
        return {"provider": None, "confidence": None, "location": None, "no_watermark": True}

    watermark.remove_image_visible(input_path, output_path)
    return {
        "provider": detect.get("provider"),
        "confidence": detect.get("confidence"),
        "location": detect.get("location"),
        "no_watermark": False,
    }
