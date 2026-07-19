"""Application settings, sourced from environment variables.

`app_name` is the one place the backend reads the product's display name from —
see Docs/README.md's "Naming & branding" section. Nothing else in this codebase
should hardcode the literal product name.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Master Ball"
    environment: str = "local"
    release: str | None = None
    """Optional deploy release/version tag forwarded to Sentry."""

    database_url: str = "postgresql+asyncpg://masterball:masterball@localhost:5432/masterball"
    valkey_url: str = "redis://localhost:6379/0"

    cors_origins: list[str] = ["http://localhost:5173"]

    embedding_cache_dir: str = ".cache/fastembed"

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None

    # LLM reliability — see app/agent/reliability.py + Docs/ai-agents-and-rag.md
    llm_router_timeout_s: float = 30.0
    llm_synthesizer_timeout_s: float = 90.0
    llm_max_retries: int = 2
    llm_fallback_enabled: bool = True

    # LangSmith — enabled automatically outside local when key is set
    # (see app/core/observability.py).
    langchain_tracing_v2: bool = False
    langchain_api_key: str | None = None
    langchain_project: str = "masterball"

    # Langfuse (optional self-hosted / cloud) — see docker-compose.langfuse.yml
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "http://localhost:3100"

    # Sentry
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_claims_email: str = "coach@example.com"

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "masterball-graph"

    mcp_api_key: str | None = None

    jwt_secret_key: str = "masterball-dev-secret-change-me-please"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7


@lru_cache
def get_settings() -> Settings:
    return Settings()
