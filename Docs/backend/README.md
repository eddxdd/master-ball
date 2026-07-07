# Backend structure & conventions

What's actually in [`Backend/`](../../Backend/) and how it's organized. For *why* these tools were chosen, see [`tech-stack.md`](../tech-stack.md); for *how to run it*, see [`setup.md`](../setup.md). This doc is the structural layer — kept in sync with the code as it grows, not a restatement of the planning docs.

## Folder layout

```
Backend/
  app/
    main.py              FastAPI app instance, CORS, route registration
    core/
      config.py          Pydantic Settings — the one place env vars are read
    db/
      session.py         Async SQLAlchemy engine/session factory
    alembic/
      env.py             Migration environment, wired to Settings.database_url
      versions/          Migration scripts (tracked in git)
  tests/
    test_health.py
  pyproject.toml         Dependencies (uv-managed) + Ruff config + pytest config
  uv.lock                Locked dependency versions — commit this, don't gitignore it
  alembic.ini
  Dockerfile             Production-style multi-stage build (see "Docker image" below)
  .env.example
```

As real features land (Pokédex, Team Builder, etc. — see [`roadmap.md`](../roadmap.md)), expect this to grow into the conventional FastAPI shape: `app/models/` (SQLAlchemy models), `app/schemas/` (Pydantic request/response models), `app/routers/` (one file per resource), `app/tools/` (the deterministic functions the AI agent calls — damage calc, team analyzer, etc., callable from REST *and* MCP per [`architecture.md`](../architecture.md)). Update this doc when those folders land for real, rather than guessing their shape here in advance.

## Conventions

- **Settings, not scattered `os.environ` calls.** Every env-driven value goes through `app.core.config.Settings` (a Pydantic `BaseSettings`), accessed via the cached `get_settings()`. This is also where the app's display name lives (`Settings.app_name`, sourced from `APP_NAME`) — see the root [`README.md`](../README.md#naming--branding) naming convention.
- **Async all the way down.** The DB engine/session (`app/db/session.py`) and route handlers are async — matches FastAPI's/SQLAlchemy 2.0's async-first design and is a real requirement once streaming AI responses and concurrent tool calls show up.
- **`get_db()` is the FastAPI dependency for DB access.** Route handlers that need a session should take `db: AsyncSession = Depends(get_db)`, not construct a session themselves.
- **Tests live in `tests/`, mirroring `app/`'s structure as it grows**, using FastAPI's `TestClient` for route tests and plain `pytest` functions for unit tests (e.g. the damage calculator, once it exists). Deterministic, correctness-critical tools (calc/analyzer) additionally get `pytest-benchmark` coverage — a performance regression should fail CI the same way a correctness regression would (see [`tech-stack.md`](../tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)).

## Migrations (Alembic)

`app/alembic/env.py` is wired to read `Settings.database_url` directly, rather than a hardcoded URL in `alembic.ini` — so the same migration setup works unmodified across local/Docker/CI/prod, driven entirely by whatever `DATABASE_URL` is in the environment. It also uses the async-engine migration pattern (`run_sync`) since the app connects via `asyncpg`, not a sync driver.

No models exist yet (Phase 1 introduces the Pokédex/team tables — see [`roadmap.md`](../roadmap.md)). Once they do:
1. Define them under `app/models/`, with a shared `Base` (declarative base).
2. Import that `Base.metadata` into `app/alembic/env.py`'s `target_metadata` (currently `None`) to enable autogenerate.
3. Run `uv run alembic revision --autogenerate -m "add pokemon table"` and review the generated script before committing it.

## Docker image

`Dockerfile` is a multi-stage build following [Astral's recommended uv + Docker pattern](https://docs.astral.sh/uv/guides/integration/docker/): dependencies are synced in a `builder` stage (cached independently of application code changes), then the whole `/app` (venv included) is copied into a slim `python:3.13-slim-bookworm` final stage. The final image does **not** include the `uv` binary itself — only the venv it built — so the container's `CMD`/`docker-compose.yml`'s override command invoke `uvicorn` directly (it's on `PATH` via `/app/.venv/bin`), not `uv run uvicorn`.

For local dev, `docker-compose.yml` overrides the image's default `CMD` with `--reload` and bind-mounts the source tree, plus a separate `backend_venv` named volume mounted at `/app/.venv` specifically to keep the container's own Linux-built venv from being shadowed by the bind mount (which wouldn't be Linux-compatible if it picked up a Windows-built `.venv` from the host anyway). This means **dependency changes require an image rebuild** (`docker compose up --build`) — they aren't picked up automatically the way source code changes are. See [`setup.md`](../setup.md#troubleshooting).
