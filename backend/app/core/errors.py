"""Predictable API errors. Never leak stack traces, SQL, or private config."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}


def not_found(what: str = "Resource") -> ApiError:
    # Same response for "does not exist" and "exists but not yours" to avoid ID enumeration.
    return ApiError(404, "not_found", f"{what} not found")


def forbidden(message: str = "You are not permitted to perform this action") -> ApiError:
    return ApiError(403, "forbidden", message)


def conflict(message: str, code: str = "conflict") -> ApiError:
    return ApiError(409, code, message)


def bad_request(message: str, code: str = "bad_request") -> ApiError:
    return ApiError(400, code, message)


class RateLimiter:
    """Sliding-window in-memory limiter (per process). Documented limitation: not shared across replicas."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = RateLimiter()
