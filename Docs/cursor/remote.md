# Cursor / operator notes — remote (EC2) → local

Server path: `/home/ec2-user/apps/master-ball`  
Region: `us-east-2` · Account: `338753559735`  
ECR: `master-ball-api`, `master-ball-frontend`  
Compose: `docker compose -f docker-compose.prod.yml …`  
Public: host port **4000** → `proxy` → frontend SPA + FastAPI (see `deploy/nginx-proxy.conf`)

## Server `.env` (names only — values stay on the box)

| Variable | Required | Notes |
|----------|----------|--------|
| `POSTGRES_USER` | yes | e.g. `masterball` |
| `POSTGRES_PASSWORD` | yes | strong |
| `POSTGRES_DB` | yes | e.g. `masterball` |
| `NEO4J_USER` | yes | default `neo4j` |
| `NEO4J_PASSWORD` | yes | strong |
| `JWT_SECRET_KEY` | yes | long random; not the local dev default |
| `ANTHROPIC_API_KEY` | for Professor | 503 on `/chat` if both LLM keys missing |
| `OPENAI_API_KEY` | for Professor | router uses OpenAI |
| `CORS_ORIGINS` | yes | JSON list: `["https://masterball.eduardolemos.com"]` |
| `VAPID_*` | optional | push notifications |
| `SENTRY_DSN` / `LANGCHAIN_API_KEY` | optional | observability |

Compose also sets `ENVIRONMENT=production` and wires `DATABASE_URL` / `VALKEY_URL` / `NEO4J_URI` internally.

## First cutover (replacing Wordle)

Old Wordle Postgres data is **not** migrated. Fresh volumes.

```bash
cd /home/ec2-user/apps/master-ball
# Stop old stack if still running
docker compose -f docker-compose.prod.yml down || true
# Ensure git remote is https://github.com/eddxdd/master-ball.git and main is the new app
git fetch origin main && git reset --hard origin/main
# Create/edit .env (see table above)
nano .env
aws ecr get-login-password --region us-east-2 | docker login -u AWS --password-stdin 338753559735.dkr.ecr.us-east-2.amazonaws.com
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### One-shot data bootstrap (required once)

Seed is heavy — do **not** put full seed on every deploy.

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
docker compose -f docker-compose.prod.yml exec backend python -m scripts.seed_pokedex
docker compose -f docker-compose.prod.yml exec backend python -m scripts.ingest_knowledge_base
docker compose -f docker-compose.prod.yml exec backend python -m scripts.load_graph
```

Optional later: `python -m scripts.sync_usage_stats` (or wait for the Arq worker cron).

## Day-2 ops

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f proxy backend worker --tail=200
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head   # after new migrations land
```

Rollback (previous image digests still in ECR): set `IMAGE_TAG=<git sha>` in `.env` temporarily, `compose pull && up -d`, or re-tag `latest` in ECR from an older push.

## RAM / Neo4j

Heap/pagecache are capped in compose (~1.5GB Neo4j budget). If the instance OOMs:

1. `docker compose -f docker-compose.prod.yml stop neo4j`
2. Remove neo4j from `depends_on` for backend (or keep URI and accept graph 503s)
3. Consider upsizing the EC2 instance (prefer ≥8GB RAM for full stack)

## Pipeline secrets (AWS console — not in git)

- CodeBuild `master-ball-deploy`: `EC2_HOST`, `EC2_USER=ec2-user`, `SSH_KEY_SECRET_NAME=master-ball/ec2-deploy-key`
- Confirm CodePipeline source repo is **`eddxdd/master-ball`** branch `main`

## Write-backs for the laptop agent

When something on the server changes (new IP, Cloudflare toggle, bootstrap done, Neo4j disabled), append a dated note here so [`local.md`](./local.md) workflows stay accurate.
