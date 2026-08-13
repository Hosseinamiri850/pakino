import pytest

from worker.app.watermark import _normalize_identify, NoWatermarkError


def test_normalize_dict():
    out = _normalize_identify({"mark": "hailuo", "confidence": 0.9, "location": "bottom-right"})
    assert out["provider"] == "hailuo"
    assert out["confidence"] == 0.9


def test_normalize_object():
    class _O:
        mark = "veo"
        confidence = 0.8
        location = "tl"

    out = _normalize_identify(_O())
    assert out["provider"] == "veo"


def test_normalize_none_raises():
    with pytest.raises(NoWatermarkError):
        _normalize_identify(None)
