import subprocess
import pytest

from worker.app import ffmpeg


def test_probe_missing_file():
    with pytest.raises(subprocess.CalledProcessError):
        ffmpeg.probe("/nonexistent/path/video.mp4")


def test_duration_missing_file():
    assert ffmpeg.duration_seconds("/nonexistent/x.mp4") == 0.0
