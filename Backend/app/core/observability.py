"""Sentry + LangSmith (+ optional Langfuse) bootstrap — called once at startup.

Tracing/error reporting is a first-class production concern, not optional
polish. Keys may still be unset in a bare local checkout; in that case each
integration no-ops cleanly rather than crashing boot.
"""

from __future__ import annotations

import logging
import os

from app.core.config import get_settings

logger = logging.getLogger("masterball.observability")


def configure_langsmith() -> None:
    """Push LangSmith settings into os.environ (LangChain reads those names
    directly) and enable tracing automatically outside `local` when a key is
    present — so staging/prod always get agent traces once LANGCHAIN_API_KEY
    is configured, without requiring a second boolean flip."""
    settings = get_settings()
    tracing = settings.langchain_tracing_v2
    if settings.environment != "local" and settings.langchain_api_key:
        tracing = True
    os.environ["LANGCHAIN_TRACING_V2"] = "true" if tracing else "false"
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
    if settings.langchain_api_key:
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    if tracing and settings.langchain_api_key:
        logger.info(
            "LangSmith tracing enabled (project=%s, env=%s)",
            settings.langchain_project,
            settings.environment,
        )


def configure_langfuse() -> None:
    """Optional Langfuse callback via env. Self-hosted compose profile sets
    LANGFUSE_* ; without keys this is a silent no-op. LangChain picks up the
    standard LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_HOST vars
    when the langfuse SDK is installed and a CallbackHandler is attached —
    see app/agent/tracing.py for the per-run callback wiring."""
    settings = get_settings()
    if settings.langfuse_public_key and settings.langfuse_secret_key:
        os.environ["LANGFUSE_PUBLIC_KEY"] = settings.langfuse_public_key
        os.environ["LANGFUSE_SECRET_KEY"] = settings.langfuse_secret_key
        if settings.langfuse_host:
            os.environ["LANGFUSE_HOST"] = settings.langfuse_host
        logger.info("Langfuse credentials configured (host=%s)", settings.langfuse_host)


def configure_sentry() -> None:
    settings = get_settings()
    if not settings.sentry_dsn:
        return
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release=settings.release,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=0.0,
        send_default_pii=False,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
            SqlalchemyIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
    )
    logger.info("Sentry initialized (environment=%s)", settings.environment)


def configure_observability() -> None:
    configure_langsmith()
    configure_langfuse()
    configure_sentry()
