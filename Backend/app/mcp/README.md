# Master Ball MCP server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server exposing three of Master Ball's deterministic Pokémon tools to any MCP client (Claude Desktop, Cursor, the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector)). Built with the official Python SDK's `FastMCP`. See [`Docs/ai-agents-and-rag.md`](../../../Docs/ai-agents-and-rag.md#4-mcp-server) for the product rationale, and [`Docs/roadmap.md`](../../../Docs/roadmap.md#phase-4--eval-loop--mcp-server) for where this fits in the overall build.

This README is meant to stand on its own, separately from the rest of the project's docs.

## What's exposed, and why only this subset

| Tool | What it does |
|---|---|
| `get_pokemon_profile` | Real base stats, full Gen 9 movepool, abilities, computed type matchups, and Mega Evolution formes for a Pokémon. |
| `calculate_damage` | Exact min/max damage and KO chance for one move, from a from-scratch Gen 9 damage formula (STAB, Terastallization, weather, crits — see [`Docs/backend/damage-calc.md`](../../../Docs/backend/damage-calc.md)). |
| `analyze_team` | Type-coverage matrix, speed tiers, weakness matrix, and role-compression flags for a full 6-Pokémon team. |

All three are **fast, synchronous, deterministic, and side-effect-free** — no writes, no LLM calls, no network calls beyond the local Postgres connection. That's a deliberate scope boundary, not a partial implementation: `lookup_meta_stats` and `parse_replay` (see `ai-agents-and-rag.md`'s full tool table) aren't exposed because they don't exist yet (Phase 5) and, for `parse_replay`, because it's job-shaped rather than a natural synchronous MCP call anyway.

**These are the exact same implementations the REST API and the LangGraph agent already use** (`app/tools/pokedex.py`, `app/tools/damage_calc.py`, `app/tools/team_analysis.py`) — this module (`app/mcp/server.py`) only adds MCP tool-schema wiring on top, per [`Docs/architecture.md`](../../../Docs/architecture.md)'s "one implementation, three surfaces" principle. A bug fix or data update to any of those tools is automatically reflected here with zero extra work.

## Architecture

```
MCP client (Claude Desktop / Cursor / Inspector)
        │
        │  stdio (local subprocess)  OR  Streamable HTTP (network, API-key gated)
        ▼
  app/mcp/server.py (FastMCP)
        │  each tool call opens its own short-lived AsyncSession
        ▼
  app/tools/{pokedex,damage_calc,team_analysis}.py   (same code REST/the agent use)
        │
        ▼
     Postgres
```

- **Two transports, one server instance.** `scripts/run_mcp_server.py --transport stdio` (the default) runs the server over stdio — what a desktop client launches directly as a subprocess it already trusts. `--transport http` serves the same tools over Streamable HTTP via `uvicorn`, for remote/multi-client access.
- **A fresh `AsyncSession` per tool call**, not a shared/global one. An MCP server has no natural per-request boundary to hang a session off the way a FastAPI request does, so each tool function opens and closes its own session — simplest-correct choice for read-only lookups at this scale.
- **Typed Pydantic schemas on both sides.** Every tool's input is a typed model (`DamageCalcToolInput`, or the existing `Team`/`PokemonSet` schemas for `analyze_team`) and every tool's return type is the actual response schema (`PokemonProfile`, `DamageCalcResult`, `TeamAnalysis`) — not a bare `dict` — so MCP clients get a real `outputSchema`, not just an `inputSchema`.

## Auth

**stdio has no auth** — its client launches the server as a local subprocess it already controls, so there's no network boundary to protect. **Streamable HTTP is gated by a single bearer API key** (`app/mcp/auth.py`'s `ApiKeyMiddleware`, wired up in `scripts/run_mcp_server.py`): every request must send `Authorization: Bearer <MCP_API_KEY>` or gets a `401`. This is a deliberately simple mechanism, not the `mcp` SDK's full OAuth (`TokenVerifier`/`AuthSettings`) machinery — a single-key bearer check is the right amount of auth for a single-tenant deployment; OAuth would be the right call if this ever needed to support multiple distinct clients/users with different permissions.

If `MCP_API_KEY` isn't set, the HTTP transport starts anyway but logs a loud warning and serves unauthenticated — the same "missing config is a visible state, never a silent gap" rule this codebase applies to the VAPID/LLM provider keys elsewhere (see [`Docs/backend/README.md`](../../../Docs/backend/README.md)).

## Failure modes

- **Not-found lookups raise `ValueError`** (e.g. an unrecognized Pokémon name, or a Status move passed to `calculate_damage`) rather than returning an empty/null success — the `mcp` SDK converts this into a proper MCP tool error (`isError: true` with the message as content) when called over a real transport. Calling `FastMCP.call_tool` directly in-process (as the test suite does) instead raises `mcp.server.fastmcp.exceptions.ToolError` with the same message — see `tests/test_mcp_server.py` for the exact pattern.
- **A missing Postgres connection** fails the same way any of this app's other DB-backed code would (a connection error surfaces as the tool's error content) — there's no special-cased fallback here, consistent with this project's "real error, never a silent stopgap" rule.
- **An unauthenticated HTTP request** gets a `401 {"error": "Unauthorized"}` before ever reaching a tool.

## Running it locally

```bash
cd Backend

# stdio (what Claude Desktop / Cursor launch directly)
uv run python -m scripts.run_mcp_server

# Streamable HTTP, on http://127.0.0.1:8100/mcp
export MCP_API_KEY=some-local-dev-key   # optional locally; required to actually gate access
uv run python -m scripts.run_mcp_server --transport http --port 8100
```

### Testing with the official MCP Inspector

```bash
npx @modelcontextprotocol/inspector uv run python -m scripts.run_mcp_server
```

This launches the Inspector's web UI connected to the server over stdio — use it to browse the three tools' schemas and call them interactively without writing any client code. For the HTTP transport, point the Inspector at `http://127.0.0.1:8100/mcp` and add the `Authorization: Bearer <MCP_API_KEY>` header in its connection settings.

### Connecting from Claude Desktop or Cursor

Add to the client's MCP config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "masterball": {
      "command": "uv",
      "args": ["run", "--directory", "/absolute/path/to/master-ball/Backend", "python", "-m", "scripts.run_mcp_server"]
    }
  }
}
```

### Automated tests

`tests/test_mcp_server.py` calls `FastMCP.call_tool` directly, in-process, against the real seeded database — no transport, no MCP client needed, since `FastMCP` exposes its tool-calling logic as a plain awaitable. This verifies the actual tool wiring (arg validation, calling into `app/tools/*`, error conversion) without the overhead/flakiness of spinning up a subprocess or an HTTP server per test.

## Stretch: multi-server composition (not pursued yet)

Configuring one MCP client to talk to this server *and* a second public MCP server (e.g. a filesystem or fetch server) simultaneously, with documented notes on how capability conflicts are handled, is flagged in `ai-agents-and-rag.md` as a strong, rare signal — genuinely worth doing if there's time, but not required for this server to be complete and useful on its own.
