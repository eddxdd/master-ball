"""Shared pytest fixtures. `close_graph_driver` addresses the same
Windows-`ProactorEventLoop`-per-test issue documented next to
app/db/session.py's `engine` disposal in several test modules (e.g.
test_agent_graph.py, test_mcp_server.py): pytest-asyncio's default
function-scoped event loop means a pooled connection opened during one test
is bound to a loop that's already closed by the time the next test runs.
Neo4j's `AsyncDriver` has the exact same pooled-connection shape SQLAlchemy's
async engine does, so it needs the same fresh-driver-per-test treatment —
applied globally here (autouse) rather than repeated in every graph-touching
test module.
"""

import pytest

from app.db.session import engine
from app.graph.session import close_driver as close_graph_driver


@pytest.fixture(autouse=True)
async def _dispose_async_clients():
    yield
    # Disposing both here (rather than only in the individual test modules
    # that already do their own `engine.dispose()`) covers any test —
    # present or future — that touches either async client, including ones
    # like test_load_graph.py that use both in the same test.
    await engine.dispose()
    await close_graph_driver()
