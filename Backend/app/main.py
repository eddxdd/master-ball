from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.session import engine
from app.routers import calculator, pokedex, team

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    # Disposes the async engine's connection pool on shutdown. Matters beyond
    # tidiness: the pool's connections are bound to whichever event loop was
    # running when they were first opened, and without this, a second
    # `TestClient(app)` context (which spins up its own fresh loop) inherits
    # a pool full of connections tied to the *previous* (now-closed) loop —
    # surfaces as "RuntimeError: Event loop is closed" on the second test.
    await engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pokedex.router)
app.include_router(calculator.router)
app.include_router(team.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app_name": settings.app_name}
