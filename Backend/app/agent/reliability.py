"""Timeouts, retries, circuit breakers, and provider fallback for LLM calls.

Wraps LangChain chat-model `.ainvoke` so every agent turn gets production-grade
failure handling without turning the graph itself into a retry maze.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.runnables import Runnable

from app.agent.circuit_breaker import CircuitOpenError, get_breaker

logger = logging.getLogger("masterball.llm_reliability")


async def ainvoke_with_resilience(
    primary: Runnable | BaseChatModel,
    messages: list[BaseMessage],
    *,
    primary_provider: str,
    fallback: Runnable | BaseChatModel | None = None,
    fallback_provider: str | None = None,
) -> Any:
    """Invoke `primary`, falling back to `fallback` on failure / open circuit.

    Circuit state is tracked per provider name. A successful fallback does not
    close the primary's breaker (primary is still unhealthy); it only records
    success on the fallback provider.
    """
    primary_breaker = get_breaker(primary_provider)
    primary_error: Exception | None = None

    try:
        primary_breaker.allow_request()
        try:
            result = await primary.ainvoke(messages)
            primary_breaker.record_success()
            return result
        except Exception as exc:
            primary_breaker.record_failure()
            primary_error = exc
            logger.warning(
                "Primary LLM (%s) failed: %s", primary_provider, exc, exc_info=False
            )
    except CircuitOpenError as exc:
        primary_error = exc
        logger.warning("%s", exc)

    if fallback is None or fallback_provider is None:
        assert primary_error is not None
        raise primary_error

    fallback_breaker = get_breaker(fallback_provider)
    fallback_breaker.allow_request()
    try:
        result = await fallback.ainvoke(messages)
        fallback_breaker.record_success()
        logger.info(
            "Served via fallback LLM (%s) after primary (%s) failure",
            fallback_provider,
            primary_provider,
        )
        return result
    except Exception as exc:
        fallback_breaker.record_failure()
        logger.error("Fallback LLM (%s) also failed: %s", fallback_provider, exc)
        if primary_error is not None:
            raise primary_error from exc
        raise
