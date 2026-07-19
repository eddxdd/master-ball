"""Entry point for the standalone MCP server (Phase 4) — see app/mcp/README.md.

Run:
    uv run python -m scripts.run_mcp_server                  # stdio (default)
    uv run python -m scripts.run_mcp_server --transport http --port 8100

stdio is what a desktop MCP client (Claude Desktop, Cursor) launches directly
as a subprocess. The HTTP transport is for remote/multi-client access, and is
the one MCP_API_KEY (see app/mcp/auth.py) actually protects.
"""

import argparse

import uvicorn

from app.mcp.auth import wrap_with_auth
from app.mcp.server import mcp_server


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()

    if args.transport == "stdio":
        mcp_server.run(transport="stdio")
        return

    app = wrap_with_auth(mcp_server.streamable_http_app())
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
