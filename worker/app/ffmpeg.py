"""FFmpeg helpers — always uses subprocess with a list of args (never shell=True)
and never interpolates untrusted input. Filenames are local temp paths only.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def probe(path: str) -> dict:
    """Return ffprobe metadata dict. Raises on invalid/non-video."""
    args = [
        FFPROBE,
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        path,
    ]
    res = subprocess.run(args, capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def duration_seconds(path: str) -> float:
    try:
        meta = probe(path)
        return float(meta.get("format", {}).get("duration", 0)) or 0.0
    except Exception:
        return 0.0


def encode_copy(input_path: str, output_path: str) -> None:
    """Stream-copy (no re-encode) for fast passthrough when no pixel work is needed."""
    args = [FFMPEG, "-y", "-i", input_path, "-c", "copy", "-movflags", "+faststart", output_path]
    subprocess.run(args, capture_output=True, text=True, check=True)
