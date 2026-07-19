"""Basic API-key auth for the MCP server's Streamable HTTP transport — see
app/mcp/README.md's "Auth" section for why this is a plain bearer-token
check rather than full OAuth (the mcp SDK's `TokenVerifier`/`AuthSettings`
machinery), and why it only applies to the HTTP transport at all (stdio has
no network boundary to protect: its client launches it as a local
subprocess it already trusts).
"""

import logging

from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Requires `Authorization: Bearer <MCP_API_KEY>` on every request. If
    `MCP_API_KEY` isn't set at all, auth is disabled — logged loudly at
    startup (see `wrap_with_auth`) rather than silently open, matching this
    project's "missing config is a visible state, never a silent gap" rule
    (e.g. VAPID keys/LLM provider keys elsewhere in this codebase)."""

    def __init__(self, app, api_key: str) -> None:
        super().__init__(app)
        self._api_key = api_key

    async def dispatch(self, request: Request, call_next):
        header = request.headers.get("authorization", "")
        expected = f"Bearer {self._api_key}"
        if header != expected:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        return await call_next(request)


def wrap_with_auth(app: Starlette) -> Starlette:
    """Applies ApiKeyMiddleware if MCP_API_KEY is configured; otherwise
    returns the app unmodified and logs a warning. Called once, at HTTP
    transport startup (see scripts/run_mcp_server.py) — never for the stdio
    transport."""
    settings = get_settings()
    if not settings.mcp_api_key:
        logger.warning(
            "MCP_API_KEY is not set — the MCP server's HTTP transport is running "
            "WITHOUT authentication. Set MCP_API_KEY in your environment before "
            "exposing this beyond localhost. See Backend/.env.example."
        )
        return app
    app.add_middleware(ApiKeyMiddleware, api_key=settings.mcp_api_key)
    return app
