"""Unit tests for the per-provider circuit breaker."""

import pytest

from app.agent.circuit_breaker import CircuitBreaker, CircuitOpenError, reset_breakers
from app.agent.reliability import ainvoke_with_resilience


@pytest.fixture(autouse=True)
def _clean_breakers():
    reset_breakers()
    yield
    reset_breakers()


def test_opens_after_threshold_failures():
    breaker = CircuitBreaker(provider="test", failure_threshold=3, recovery_seconds=60)
    for _ in range(3):
        breaker.record_failure()
    with pytest.raises(CircuitOpenError):
        breaker.allow_request()


def test_success_resets_failures():
    breaker = CircuitBreaker(provider="test", failure_threshold=2, recovery_seconds=60)
    breaker.record_failure()
    breaker.record_success()
    breaker.allow_request()  # should not raise


class _Ok:
    async def ainvoke(self, _messages):
        return "ok"


class _Boom:
    async def ainvoke(self, _messages):
        raise RuntimeError("upstream down")


@pytest.mark.asyncio
async def test_fallback_used_when_primary_fails():
    result = await ainvoke_with_resilience(
        _Boom(),
        [],
        primary_provider="primary_test",
        fallback=_Ok(),
        fallback_provider="fallback_test",
    )
    assert result == "ok"
