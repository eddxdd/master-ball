"""Per-provider circuit breaker for LLM calls.

Fails fast with a clear error once a provider is unhealthy, instead of hanging
every chat turn on a dying upstream. Half-open after `recovery_seconds` so a
recovered provider can take traffic again.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field

logger = logging.getLogger("masterball.circuit_breaker")


class CircuitOpenError(RuntimeError):
    """Raised when the breaker is open and requests should not be attempted."""

    def __init__(self, provider: str, retry_after_s: float):
        super().__init__(
            f"Circuit open for provider '{provider}' — retry after {retry_after_s:.0f}s"
        )
        self.provider = provider
        self.retry_after_s = retry_after_s


@dataclass
class CircuitBreaker:
    provider: str
    failure_threshold: int = 5
    recovery_seconds: float = 60.0
    _failures: int = 0
    _opened_at: float | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def allow_request(self) -> None:
        """Raise CircuitOpenError if the breaker is open (and not yet half-open)."""
        with self._lock:
            if self._opened_at is None:
                return
            elapsed = time.monotonic() - self._opened_at
            if elapsed >= self.recovery_seconds:
                # Half-open: allow one probe through.
                logger.info("Circuit half-open for %s — allowing probe", self.provider)
                return
            raise CircuitOpenError(self.provider, self.recovery_seconds - elapsed)

    def record_success(self) -> None:
        with self._lock:
            if self._failures or self._opened_at is not None:
                logger.info("Circuit closed for %s after success", self.provider)
            self._failures = 0
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self.failure_threshold and self._opened_at is None:
                self._opened_at = time.monotonic()
                logger.warning(
                    "Circuit OPEN for %s after %d failures (recovery %.0fs)",
                    self.provider,
                    self._failures,
                    self.recovery_seconds,
                )


_breakers: dict[str, CircuitBreaker] = {}
_breakers_lock = threading.Lock()


def get_breaker(provider: str) -> CircuitBreaker:
    with _breakers_lock:
        if provider not in _breakers:
            _breakers[provider] = CircuitBreaker(provider=provider)
        return _breakers[provider]


def reset_breakers() -> None:
    """Test helper — clears all breaker state between tests."""
    with _breakers_lock:
        _breakers.clear()
