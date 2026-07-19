#!/usr/bin/env bash
# One-shot production data bootstrap (run on EC2 after first compose up).
# Usage (from /home/ec2-user/apps/master-ball):
#   docker compose -f docker-compose.prod.yml exec backend bash /app/../deploy/bootstrap.sh
# Or copy commands from Docs/cursor/remote.md and run via:
#   docker compose -f docker-compose.prod.yml exec backend sh -c '...'

set -euo pipefail

echo "==> alembic upgrade head"
alembic upgrade head

echo "==> seed_pokedex"
python -m scripts.seed_pokedex

echo "==> ingest_knowledge_base"
python -m scripts.ingest_knowledge_base

echo "==> load_graph (Neo4j)"
python -m scripts.load_graph || echo "WARN: load_graph failed — teammate graph may be empty until Neo4j is healthy."

echo "==> bootstrap complete"
