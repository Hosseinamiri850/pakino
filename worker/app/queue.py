import json
import redis
from .config import Settings


def make_redis(settings: Settings) -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def brpop_job(r: redis.Redis, queue_name: str, timeout: int = 0) -> dict | None:
    item = r.brpop(queue_name, timeout=timeout)
    if item is None:
        return None
    _queue, raw = item
    return json.loads(raw)


def is_cancelled(r: redis.Redis, job_id: str) -> bool:
    return bool(r.exists(f"pakino:cancelled:{job_id}"))
