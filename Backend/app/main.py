from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import RequestLoggingMiddleware, configure_logging
from app.core.observability import configure_observability
from app.db.session import engine
from app.graph.session import close_driver as close_graph_driver
from app.routers import (
    abilities,
    auth,
    calculator,
    chat,
    items,
    meta,
    ml,
    moves,
    pokedex,
    replay,
    scout,
    search,
    sessions,
    team,
    types,
)

settings = get_settings()
configure_logging(settings.environment)
configure_observability()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()
    await close_graph_driver()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware, environment=settings.environment)

app.include_router(auth.router)
app.include_router(pokedex.router)
app.include_router(calculator.router)
app.include_router(team.router)
app.include_router(items.router)
app.include_router(moves.router)
app.include_router(abilities.router)
app.include_router(types.router)
app.include_router(search.router)
app.include_router(chat.router)
app.include_router(sessions.router)
app.include_router(meta.router)
app.include_router(scout.router)
app.include_router(replay.router)
app.include_router(ml.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app_name": settings.app_name}
