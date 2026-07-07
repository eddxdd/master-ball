# Local development setup

Everything runs locally via Docker Compose for now — no cloud account is required to work on this project (AWS deployment is a later phase; see [`roadmap.md`](./roadmap.md)). This doc covers running the whole stack. For what's actually inside each service, see [`backend/README.md`](./backend/README.md) and [`frontend/README.md`](./frontend/README.md).

## Prerequisites

- **Docker Desktop** (with Docker Compose v2, bundled by default) — this is the only hard requirement to run the app.
- **[uv](https://docs.astral.sh/uv/)** — only needed if you're working on the backend *outside* Docker (e.g. running tests/lint directly, better editor integration). Install: `irm https://astral.sh/uv/install.ps1 | iex` (Windows) or see the uv docs for macOS/Linux.
- **Node.js 24+** — only needed if you're working on the frontend *outside* Docker for the same reason.

## Running everything

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000) — health check at `/health`, interactive API docs at `/docs`
- Postgres: `localhost:5432` (pgvector-enabled image)
- Valkey: `localhost:6379`

First run pulls/builds images and can take a few minutes. Subsequent runs are fast (Docker layer cache). Use plain `docker compose up` (no `--build`) once images exist and you haven't changed a `Dockerfile`/dependency file.

Stop everything with `docker compose down` (add `-v` to also wipe the Postgres/Valkey volumes and start from a clean database).

## Environment variables

Three separate `.env.example` files exist, one per layer — copy each to `.env` in the same folder:

| File | Consumed by | Notes |
|---|---|---|
| [`.env.example`](../.env.example) (repo root) | `docker-compose.yml` | `APP_NAME`, Postgres credentials. This is the one you need for `docker compose up`. |
| [`Backend/.env.example`](../Backend/.env.example) | The backend, when run *outside* Docker (`uv run uvicorn ...` directly) | Same variables, but as full connection strings pointed at `localhost` instead of Docker service names. |
| [`Frontend/.env.example`](../Frontend/.env.example) | The frontend, when run *outside* Docker (`npm run dev` directly) | Only `VITE_`-prefixed vars are exposed to client code — this is a Vite convention, not a DexTrAIner-specific rule. |

The naming convention behind `APP_NAME`/`VITE_APP_NAME` is documented in [`README.md`](./README.md#naming--branding) — there's exactly one place per layer that owns the display name.

## Running the backend or frontend outside Docker

Sometimes faster for tight edit-test loops (better debugger/editor integration than in a container). Postgres/Valkey still need to come from Docker:

```bash
docker compose up postgres valkey
```

Then, in a separate terminal, for the backend:

```bash
cd Backend
cp .env.example .env   # DATABASE_URL/VALKEY_URL already point at localhost
uv sync
uv run uvicorn app.main:app --reload
```

Or the frontend:

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

## Common commands

| Task | Backend | Frontend |
|---|---|---|
| Lint | `uv run ruff check .` | `npm run lint` |
| Format | `uv run ruff format .` | `npm run format` |
| Typecheck | (Ruff covers most of this; no separate step) | `npm run typecheck` |
| Test | `uv run pytest` | `npm run test` |
| New DB migration | `cd Backend && uv run alembic revision --autogenerate -m "..."` | — |

Both sides are also checked in CI on every push/PR — see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Troubleshooting

- **Port already in use (5432, 6379, 8000, or 5173).** Something else on your machine is already listening there. Stop it, or change the left-hand side of the port mapping in `docker-compose.yml` (e.g. `"5433:5432"`).
- **Backend can't reach Postgres/Valkey on first boot.** The backend container waits on Postgres/Valkey's healthchecks before starting (see `depends_on: condition: service_healthy` in `docker-compose.yml`), so this shouldn't happen — but if it does, `docker compose logs postgres` / `docker compose logs valkey` first.
- **Frontend shows "Backend unreachable."** Check `docker compose logs backend` for a startup error, and confirm `VITE_API_BASE_URL` (frontend env) actually points at `http://localhost:8000` — from the *browser's* perspective, not the Docker network's, since the health check fetch runs client-side.
- **Changed `Backend/pyproject.toml` or `Frontend/package.json` and the container doesn't pick it up.** Dependencies are installed at image build time, not on container start (see `backend_venv`/`frontend_node_modules` named volumes in `docker-compose.yml`, which deliberately persist the *container's* installed dependencies over your host's bind-mounted source). Re-run `docker compose up --build` after a dependency change.
- **`npm ci` fails inside Docker/CI with a "Missing: @emnapi/..." error, even though `npm install` works fine locally.** This is a known cross-platform `package-lock.json` quirk: this project is developed on Windows, and Windows-generated lockfiles can omit Linux-only optional native dependencies (used by `lightningcss`/Tailwind's WASM fallback path) that a Linux container or CI runner needs. That's why both `Frontend/Dockerfile.dev` and `.github/workflows/ci.yml` deliberately use `npm install` instead of `npm ci` — see the comment in `Frontend/Dockerfile.dev` for the full explanation. If you hit this in a new context, that's the same root cause.
- **Postgres data looks stale/corrupted after changing `docker-compose.yml`'s Postgres config.** Named volumes persist data independently of the container definition. `docker compose down -v` wipes volumes and gives you a clean slate (you'll lose local data, which is fine — nothing here is production data yet).
