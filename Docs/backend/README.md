# Backend structure & conventions

What's actually in [`Backend/`](../../Backend/) and how it's organized. For *why* these tools were chosen, see [`tech-stack.md`](../tech-stack.md); for *how to run it*, see [`setup.md`](../setup.md). This doc is the structural layer — kept in sync with the code as it grows, not a restatement of the planning docs.

## Folder layout

```
Backend/
  app/
    main.py              FastAPI app instance, CORS, lifespan (engine disposal), route registration
    core/
      config.py          Pydantic Settings — the one place env vars are read
    db/
      session.py         Async SQLAlchemy engine/session factory + declarative Base
    alembic/
      env.py             Migration environment, wired to Settings.database_url
      versions/          Migration scripts (tracked in git)
    models/              SQLAlchemy ORM models (Species, Move, Ability, Nature, TypeMatchup)
    schemas/             Pydantic request/response models, one file per feature area
    tools/               The deterministic functions — plain async callables taking a
                          DB session, usable from REST now and the agent/MCP layers later,
                          per architecture.md's "one implementation, three surfaces" rule
    routers/             FastAPI routers, one file per resource, thin — just
                          request/response wiring around a tools/ function
    data/                Small curated/static Python data (ability descriptions,
                          damage-calc modifier tables) that isn't worth a DB table
  scripts/
    seed_pokedex.py       One-time, re-runnable seed script (see "Data seeding" below)
  tests/
    test_health.py
    test_pokedex.py, test_damage_calc.py, test_team.py, ...
  pyproject.toml         Dependencies (uv-managed) + Ruff config + pytest config
  uv.lock                Locked dependency versions — commit this, don't gitignore it
  alembic.ini
  Dockerfile             Production-style multi-stage build (see "Docker image" below)
  .env.example
```

## Tools, schemas, and routers — how a feature is structured

Every deterministic feature (Pokédex lookup, damage calculator, team analyzer, and later the RAG/agent tools) follows the same three-layer shape, per [`architecture.md`](../architecture.md)'s "one implementation, three surfaces" principle:

1. **`app/schemas/<feature>.py`** — Pydantic input/output models. These are the actual API contract, and (later) what the LLM tool-calling layer reads.
2. **`app/tools/<feature>.py`** — the real logic, as plain `async def` functions taking `db: AsyncSession` plus typed args, returning a schema object (or `None` for a not-found case). No FastAPI-specific code lives here — this is what makes the same function reusable from REST, the LangGraph agent, and the MCP server without duplication.
3. **`app/routers/<feature>.py`** — thin FastAPI route handlers: pull dependencies (`Depends(get_db)`), call the tool function, translate `None`/a domain exception into the right HTTP status. No business logic here.

Shared logic that more than one tool needs (e.g. the type-effectiveness chart, used by both `get_pokemon_profile` and `analyze_team`) lives in its own `app/tools/<shared_thing>.py` (see `type_chart.py`) rather than being duplicated or awkwardly imported cross-feature.

## Data seeding

`scripts/seed_pokedex.py` populates the `species`/`moves`/`abilities`/`natures`/`type_matchups` tables from `poke-env`'s bundled Gen 9 data (see [`tech-stack.md`](../tech-stack.md#backend) for why `poke-env`). Run it with:

```bash
cd Backend
uv run python -m scripts.seed_pokedex
```

It's idempotent (`INSERT ... ON CONFLICT DO UPDATE`) — safe to re-run after a `poke-env` version bump (it auto-syncs from Smogon roughly monthly) to pick up data corrections.

Two real data-quality issues came up building this, worth knowing before touching the seed script again:
- **CAP/non-standard entries.** `poke-env`'s pokedex includes Create-A-Pokémon and other Showdown-community entries alongside real ones, distinguishable only by a non-positive `num` — filtered out via `if num <= 0: continue`.
- **Forme movepools must be *merged* with the base species', not used instead of it.** A forme's own learnset entry is usually just its forme-exclusive move(s) (e.g. Rotom-Wash's own entry is only Hydro Pump) or entirely absent (Mega Evolutions have none). The first implementation treated "the forme has *any* learnset entry" as a reason to skip merging with the base species — which silently produced a 1-move movepool for every Rotom forme (missing Volt Switch, Protect, Will-O-Wisp, everything). Fixed by always unioning the forme's own moves with the base species' moves for any true forme (see `_movepool_for` in `scripts/seed_pokedex.py`) — caught by comparing the Pokédex UI's movepool display against known real movesets, not by a test that happened to only check a species where the bug didn't manifest (Landorus-Therian's *own* issue was different: an empty `eventOnly` entry, which the union-based fix also handles correctly).

## Conventions

- **Settings, not scattered `os.environ` calls.** Every env-driven value goes through `app.core.config.Settings` (a Pydantic `BaseSettings`), accessed via the cached `get_settings()`. This is also where the app's display name lives (`Settings.app_name`, sourced from `APP_NAME`) — see the root [`README.md`](../README.md#naming--branding) naming convention.
- **Async all the way down.** The DB engine/session (`app/db/session.py`) and route handlers are async — matches FastAPI's/SQLAlchemy 2.0's async-first design and is a real requirement once streaming AI responses and concurrent tool calls show up.
- **`get_db()` is the FastAPI dependency for DB access.** Route handlers that need a session should take `db: AsyncSession = Depends(get_db)`, not construct a session themselves.
- **Tests live in `tests/`, mirroring `app/`'s structure as it grows**, using FastAPI's `TestClient` for route tests and plain `pytest` functions for unit tests (e.g. `test_damage_calc.py`'s hand-verified formula checks). Deterministic, correctness-critical tools (calc/analyzer) additionally get `pytest-benchmark` coverage — a performance regression should fail CI the same way a correctness regression would (see [`tech-stack.md`](../tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)).
- **`TestClient` must be used as a context manager (`with TestClient(app) as client:`) in any test that touches the DB.** A bare `TestClient(app)` at module scope works for a single request but breaks on a second one with "Event loop is closed," because the async SQLAlchemy engine's connection pool is bound to whichever event loop was running when it was first used, and each bare `TestClient` call can spin up a fresh one. Fixed at the source via `app/main.py`'s `lifespan` handler, which disposes the engine's pool on shutdown — but the context-manager pattern in tests is still required to get a clean shutdown per test. See the fixture in `tests/test_pokedex.py` for the pattern to copy.

## Migrations (Alembic)

`app/alembic/env.py` is wired to read `Settings.database_url` directly, rather than a hardcoded URL in `alembic.ini` — so the same migration setup works unmodified across local/Docker/CI/prod, driven entirely by whatever `DATABASE_URL` is in the environment. It also uses the async-engine migration pattern (`run_sync`) since the app connects via `asyncpg`, not a sync driver.

`app/alembic/env.py`'s `target_metadata` is wired to `Base.metadata` (via `from app import models`, which populates it by importing every model module) — so adding a new model just means:
1. Define it under `app/models/`, inheriting from the shared `Base` (`app/db/session.py`) and re-exporting it from `app/models/__init__.py`.
2. Run `uv run alembic revision --autogenerate -m "add whatever table"` and review the generated script before committing it — autogenerate is a good first draft, not a substitute for reading the diff.
3. `uv run alembic upgrade head` to apply it locally.

## Docker image

`Dockerfile` is a multi-stage build following [Astral's recommended uv + Docker pattern](https://docs.astral.sh/uv/guides/integration/docker/): dependencies are synced in a `builder` stage (cached independently of application code changes), then the whole `/app` (venv included) is copied into a slim `python:3.13-slim-bookworm` final stage. The final image does **not** include the `uv` binary itself — only the venv it built — so the container's `CMD`/`docker-compose.yml`'s override command invoke `uvicorn` directly (it's on `PATH` via `/app/.venv/bin`), not `uv run uvicorn`.

For local dev, `docker-compose.yml` overrides the image's default `CMD` with `--reload` and bind-mounts the source tree, plus a separate `backend_venv` named volume mounted at `/app/.venv` specifically to keep the container's own Linux-built venv from being shadowed by the bind mount (which wouldn't be Linux-compatible if it picked up a Windows-built `.venv` from the host anyway). This means **dependency changes require an image rebuild** (`docker compose up --build`) — they aren't picked up automatically the way source code changes are. See [`setup.md`](../setup.md#troubleshooting).
