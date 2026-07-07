"""Async SQLAlchemy engine/session setup, pointed at Postgres via Settings.database_url.

No models are defined yet — Phase 1 introduces the Pokédex/team tables. This module
exists in Phase 0 purely to prove the engine/session wiring and Alembic migration
path work end-to-end against the Dockerized Postgres instance.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False, future=True)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped async session."""
    async with AsyncSessionLocal() as session:
        yield session
