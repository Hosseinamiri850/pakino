import pytest
from worker.app.models import JobMessage


def test_from_dict():
    d = {
        "job_id": "abc",
        "user_id": None,
        "type": "image",
        "input_key": "uploads/x.png",
        "input_filename": "x.png",
        "mime_type": "image/png",
        "size_bytes": 100,
        "expires_at": 123,
        "processing_backend": "opencv",
    }
    m = JobMessage.from_dict(d)
    assert m.job_id == "abc"
    assert m.type == "image"
    assert m.processing_backend == "opencv"


def test_from_dict_missing_key():
    with pytest.raises(KeyError):
        JobMessage.from_dict({"job_id": "x"})
