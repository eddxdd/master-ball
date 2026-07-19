# Master Ball

Competitive Pokémon toolkit + AI coach. Pokédex, team builder, damage calc, usage stats, and a Professor chat that answers from real tool results (not vibes).

Live: [masterball.eduardolemos.com](https://masterball.eduardolemos.com/)

## What's in here

- **Pokédex** — species, moves, abilities, items, type charts, sprites
- **Team Builder** — visual roster editor, coverage/insights, teammate suggestions, VS / win-prob estimates
- **Damage Calculator** — poke-env backed matchup math
- **Analytics** — Smogon-style usage when synced
- **Professor** — LangGraph agent over WebSocket; tools for profiles, damage, meta, RAG notes
- **Accounts** — optional signup for saved preferences / cosmetics

Deeper design notes live under [`Docs/`](./Docs/README.md). Ops for the EC2 deploy: [`Docs/cursor/`](./Docs/cursor/local.md).

## Stack

| Layer | Tech |
|--------|------|
| Frontend | React 19, TypeScript, Vite, TanStack Query |
| Backend | FastAPI, SQLAlchemy, Alembic, LangGraph / LangChain |
| Data | Postgres + pgvector, Valkey, Neo4j (graph teammates) |
| Worker | Arq (usage sync cron) |
| Local / prod | Docker Compose |

## Prerequisites

- Docker Desktop (Compose v2) — enough to run the full stack
- Optional: [uv](https://docs.astral.sh/uv/) and Node 24+ if you work outside containers

## Quick start

```bash
git clone https://github.com/eddxdd/master-ball.git
cd master-ball
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---------|-----|
| App | http://localhost:5173 |
| API | http://localhost:8000 (`/health`, `/docs`) |
| Postgres | `localhost:5433` (not 5432 — avoids clashing with a host Postgres) |
| Valkey | `localhost:6379`

First boot is slow (image pulls). After that, `docker compose up` is fine.

### Seed data (once per fresh DB)

Compose does **not** auto-seed. After the stack is up:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed_pokedex
docker compose exec backend python -m scripts.ingest_knowledge_base   # RAG for Professor
docker compose exec backend python -m scripts.load_graph              # Neo4j teammates
```

All of those are safe to re-run.

### Professor chat keys

Put `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in the root `.env`. Without them `/chat` returns `503` on purpose — no fake answers.

## Useful commands

```bash
# logs
docker compose logs -f backend frontend

# tests (backend, needs compose services up or CI-style services)
docker compose exec backend pytest

# frontend (from host, with node_modules installed)
cd Frontend && npm ci && npm test && npm run build

# wipe DB volumes and start clean
docker compose down -v
```

More env / troubleshooting: [`Docs/setup.md`](./Docs/setup.md).

## Production

Prod runs on EC2 via `docker-compose.prod.yml` (proxy on **:4000**, same as the previous site so DNS stays put). Images go to ECR; CodePipeline deploys on push to `main`.

- Server `.env` template: [`.env.production.example`](./.env.production.example)
- Cutover / bootstrap / SSH: [`Docs/cursor/remote.md`](./Docs/cursor/remote.md)
- Laptop → pipeline notes: [`Docs/cursor/local.md`](./Docs/cursor/local.md)

Seed is **one-shot on first deploy**, not on every container start (unlike the old Wordle seed-every-boot flow).

## Repo layout

```
Backend/          FastAPI app, agent, migrations, scripts
Frontend/         Vite React app
Docs/             product + architecture + ops
deploy/           nginx edge proxy for prod
docker-compose.yml
docker-compose.prod.yml
buildspec*.yml    AWS CodeBuild
```

## License

ISC

---

Pokémon is a trademark of its owners. Species/move data sourced via [PokeAPI](https://pokeapi.co/) and Showdown-related tooling where noted. For personal / educational use.
