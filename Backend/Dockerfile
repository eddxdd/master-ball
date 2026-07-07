# Multi-stage build following Astral's recommended uv + Docker pattern:
# https://docs.astral.sh/uv/guides/integration/docker/
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Install dependencies in their own layer so they're cached unless
# pyproject.toml/uv.lock change, independent of application code changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

COPY . .
RUN uv sync --locked --no-dev

FROM python:3.13-slim-bookworm
WORKDIR /app
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# docker-compose.yml overrides this with `--reload` + a source volume mount for local dev.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
