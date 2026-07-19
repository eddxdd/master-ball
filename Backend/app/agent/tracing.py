"""Optional Langfuse callback handler for LangGraph runs.

Credentials are pushed into os.environ by configure_langfuse() at startup.
The v4 CallbackHandler only needs public_key (secret/host come from env).
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("masterball.tracing")


def langfuse_callbacks() -> list[Any]:
    settings = get_settings()
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        return []
    try:
        from langfuse.langchain import CallbackHandler

        return [CallbackHandler(public_key=settings.langfuse_public_key)]
    except Exception as exc:
        logger.warning("Langfuse callback unavailable: %s", exc)
        return []
