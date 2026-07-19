"""Structured request logging with request_id, route, status, and latency.

Used by the ASGI middleware in app/main.py. Stdlib logging only — no extra
shipper required; CloudWatch / whatever scrapes stdout in staging/prod.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from collections.abc import Callable
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def configure_logging(environment: str) -> None:
    """Configure root logging once at startup."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    if environment in {"staging", "production", "prod"}:
        handler.setFormatter(logging.Formatter("%(message)s"))
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("neo4j").setLevel(logging.WARNING)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attaches X-Request-ID and emits one structured access log per request."""

    def __init__(self, app: Any, *, environment: str = "local"):
        super().__init__(app)
        self.environment = environment
        self.log = logging.getLogger("masterball.http")

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
            path = request.url.path
            if not (path == "/health" and self.environment != "local"):
                payload = {
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": path,
                    "status": status_code,
                    "latency_ms": elapsed_ms,
                }
                if self.environment in {"staging", "production", "prod"}:
                    self.log.info(json.dumps(payload, separators=(",", ":")))
                else:
                    self.log.info(
                        "%s %s -> %s (%.1fms) request_id=%s",
                        request.method,
                        path,
                        status_code,
                        elapsed_ms,
                        request_id,
                    )
