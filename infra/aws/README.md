# AWS deploy

**Current production path (live cutover):** EC2 + Docker Compose + ECR + CodePipeline, documented in [`Docs/cursor/local.md`](../../Docs/cursor/local.md) and [`Docs/cursor/remote.md`](../../Docs/cursor/remote.md). Compose file: [`docker-compose.prod.yml`](../../docker-compose.prod.yml). Domain: https://masterball.eduardolemos.com/

The App Runner / RDS sketch below is a **future** scale-up option, not what ships the site today.

---

## Future: App Runner / ECS sketch

Master Ball's longer-term cloud shape (see [`Docs/tech-stack.md`](../../Docs/tech-stack.md)): App Runner (or ECS/Fargate) + RDS Postgres (pgvector) + ElastiCache Valkey + Secrets Manager.

## What you need

1. An AWS account + CLI configured (`aws configure` or SSO)
2. GitHub Actions secrets (for the workflow in `.github/workflows/deploy-staging.yml`):
   - `AWS_ROLE_ARN` — OIDC deploy role
   - `AWS_REGION` — e.g. `us-east-1`
   - App secrets mirrored into Secrets Manager / App Runner env (see below)

## Recommended first staging shape

| Piece | Service | Notes |
|---|---|---|
| API + worker | App Runner (API) + ECS Fargate task (Arq worker), **or** one ECS service with two task defs | Same Docker image as `Backend/Dockerfile` |
| Frontend | S3 + CloudFront **or** App Runner serving the Vite production build (`Frontend/Dockerfile`) | Set `VITE_API_BASE_URL` at build time |
| Postgres + pgvector | RDS PostgreSQL 16 | Enable `pgvector` extension after create |
| Valkey | ElastiCache for Valkey | Wire-compatible Redis URL |
| Neo4j | EC2 / Aura free tier / skip GraphRAG endpoints until ready | Graph tools return 503 when unreachable — same as local |
| Secrets | Secrets Manager | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET_KEY`, `SENTRY_DSN`, `LANGCHAIN_API_KEY`, … |
| Observability | Sentry + LangSmith (always on in `ENVIRONMENT=staging`) | See `app/core/observability.py` |

## Bootstrap checklist

```bash
# 1. Build & push the API image
docker build -t master-ball-api ./Backend
# tag + push to ECR…

# 2. Apply migrations + seed against RDS
# (run once from a one-off task / bastion with DATABASE_URL pointing at RDS)
alembic upgrade head
python -m scripts.seed_pokedex
python -m scripts.ingest_knowledge_base
python -m scripts.load_graph   # if Neo4j is up

# 3. Set ENVIRONMENT=staging on the API service so LangSmith auto-enables
#    when LANGCHAIN_API_KEY is present, and JSON request logs are used.
```

## GitHub Actions

`.github/workflows/deploy-staging.yml` builds the backend image and (when `AWS_ROLE_ARN` is configured) pushes to ECR and updates the App Runner / ECS service. Without those secrets the workflow still builds the image as a dry-run CI check so the deploy path stays exercised.

## Why App Runner first

Lowest-ops container hosting that still teaches real AWS deploy skills (ECR, IAM, secrets, health checks, HTTPS). Graduate to ECS/Fargate when you need the Arq worker as a first-class long-running service beside the API — the Docker image is already shared (`command: arq app.worker.WorkerSettings`).
