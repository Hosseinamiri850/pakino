from dataclasses import dataclass


@dataclass
class JobMessage:
    job_id: str
    user_id: "str | None"
    type: str  # image | video
    input_key: str
    input_filename: str
    mime_type: str
    size_bytes: int
    expires_at: float  # epoch ms
    processing_backend: str

    @classmethod
    def from_dict(cls, d: dict) -> "JobMessage":
        return cls(
            job_id=d["job_id"],
            user_id=d.get("user_id"),
            type=d["type"],
            input_key=d["input_key"],
            input_filename=d["input_filename"],
            mime_type=d["mime_type"],
            size_bytes=d["size_bytes"],
            expires_at=d["expires_at"],
            processing_backend=d.get("processing_backend", "opencv"),
        )


SUPPORTED_VIDEO_PROVIDERS = ("sora", "veo", "seedance", "dola", "hailuo", "kling")
