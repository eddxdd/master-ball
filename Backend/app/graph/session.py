"""Neo4j driver wiring — one process-wide `AsyncDriver` (the driver itself is
already a connection pool, same shape as SQLAlchemy's `engine` in
app/db/session.py), created lazily on first use rather than at import time so
importing this module never requires Neo4j to already be reachable.
"""

from neo4j import AsyncDriver, AsyncGraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from app.core.config import get_settings

_driver: AsyncDriver | None = None


class GraphUnavailableError(Exception):
    """Raised when Neo4j can't be reached or a query against it fails — turned
    into a clean 503 by the routers that use it (app/routers/team.py), the
    same "real infra problem, not a fabricated answer" shape as
    MissingProviderKeyError elsewhere in this app."""


def get_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        settings = get_settings()
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
        )
    return _driver


async def close_driver() -> None:
    """Called on app shutdown (see app/main.py) — mirrors app/db/session.py's
    engine disposal so a dev-server reload doesn't leak connections."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


async def run_query(query: str, **params: object) -> list[dict]:
    """Runs a single Cypher query and returns every record as a plain dict —
    the thin, shared entry point every graph tool query goes through, so
    driver-unreachable/query-error handling only has to live in one place."""
    driver = get_driver()
    try:
        async with driver.session() as session:
            result = await session.run(query, params)
            records = await result.data()
            return records
    except (ServiceUnavailable, Neo4jError) as exc:
        raise GraphUnavailableError(
            f"Couldn't reach the knowledge graph (Neo4j): {exc}. Is `docker compose up neo4j` "
            "running, and has `scripts/load_graph.py` been run at least once?"
        ) from exc


__all__ = ["GraphUnavailableError", "close_driver", "get_driver", "run_query"]
