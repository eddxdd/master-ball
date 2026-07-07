"""Application settings, sourced from environment variables.

`app_name` is the one place the backend reads the product's display name from —
see Docs/README.md's "Naming & branding" section. Nothing else in this codebase
should hardcode the literal product name.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DexTrAIner"
    environment: str = "local"

    database_url: str = "postgresql+asyncpg://dextrainer:dextrainer@localhost:5432/dextrainer"
    valkey_url: str = "redis://localhost:6379/0"

    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
