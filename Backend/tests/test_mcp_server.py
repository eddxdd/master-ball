"""Tests for the standalone MCP server (Phase 4) — see app/mcp/README.md.

Calls FastMCP.call_tool directly, in-process, against the real seeded
database — no transport, no MCP client subprocess needed, since FastMCP
exposes its tool-calling logic as a plain awaitable. This verifies the real
tool wiring (arg validation, delegating into app/tools/*, error conversion),
not a mock of it.
"""

import json
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from starlette.testclient import TestClient

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal, engine
from app.mcp.auth import wrap_with_auth
from app.mcp.server import mcp_server
from app.models.meta import UsageStats
from app.tools import win_probability
from scripts.train_win_probability_model import train_and_save


@pytest.fixture(autouse=True)
async def _dispose_engine():
    """Same Windows-event-loop-per-test issue documented in
    tests/test_agent_graph.py — dispose the shared engine's connection pool
    after every test so each gets a fresh one bound to its own event loop."""
    yield
    await engine.dispose()


def _structured_payload(result) -> dict:
    """A tool with a typed (non-dict) return annotation gets both a
    JSON-serialized TextContent block *and* a structured-content dict back
    from FastMCP.call_tool's convert_result=True — (content_blocks,
    structured_dict). The structured dict is the one a real MCP client
    reads for a typed tool; the text block is kept for backward
    compatibility with clients that only understand plain content."""
    assert isinstance(result, tuple)
    content_blocks, structured = result
    assert len(content_blocks) == 1
    assert json.loads(content_blocks[0].text) == structured
    return structured


async def test_lists_exactly_the_seven_scoped_tools():
    tools = await mcp_server.list_tools()
    names = {t.name for t in tools}
    assert names == {
        "get_pokemon_profile",
        "calculate_damage",
        "analyze_team",
        "lookup_meta_stats",
        "scout_opponent",
        "suggest_teammates",
        "predict_win_probability",
    }
    for tool in tools:
        assert tool.description, f"{tool.name} must have an LLM-legible description"
        assert tool.outputSchema is not None, f"{tool.name} must have a typed output schema"


async def test_get_pokemon_profile_returns_real_seeded_data():
    result = await mcp_server.call_tool("get_pokemon_profile", {"pokemon_name": "Landorus-Therian"})
    payload = _structured_payload(result)

    assert payload["name"] == "Landorus-Therian"
    assert payload["type1"] == "Ground"
    assert payload["type2"] == "Flying"
    assert payload["base_stats"]["atk"] == 145


async def test_get_pokemon_profile_raises_for_unknown_pokemon():
    with pytest.raises(ToolError, match="No Pokemon found matching 'NotAPokemon'"):
        await mcp_server.call_tool("get_pokemon_profile", {"pokemon_name": "NotAPokemon"})


async def test_calculate_damage_returns_a_real_calc_result():
    result = await mcp_server.call_tool(
        "calculate_damage",
        {
            "input": {
                "attacker_species_id": "Landorus-Therian",
                "defender_species_id": "Corviknight",
                "move_id": "Earthquake",
            }
        },
    )
    payload = _structured_payload(result)

    # Corviknight is Flying/Steel — immune to Ground moves like Earthquake.
    assert payload["is_immune"] is True
    assert payload["type_effectiveness"] == 0.0
    assert payload["max_damage"] == 0


async def test_calculate_damage_raises_for_a_status_move():
    with pytest.raises(ToolError, match="no damage to calculate"):
        await mcp_server.call_tool(
            "calculate_damage",
            {
                "input": {
                    "attacker_species_id": "Landorus-Therian",
                    "defender_species_id": "Corviknight",
                    "move_id": "Roost",
                }
            },
        )


async def test_analyze_team_computes_type_coverage_for_a_real_team():
    result = await mcp_server.call_tool(
        "analyze_team",
        {
            "team": {
                "members": [
                    {"species_id": "landorustherian", "nature": "adamant"},
                    {"species_id": "corviknight", "nature": "impish"},
                ]
            }
        },
    )
    payload = _structured_payload(result)

    speed_tier_ids = {entry["species_id"] for entry in payload["speed_tiers"]}
    assert speed_tier_ids == {"landorustherian", "corviknight"}
    assert len(payload["type_coverage"]) == 18  # every type is scored


async def test_lookup_meta_stats_returns_synced_data():
    # Seeded directly (not relying on a real scripts/sync_usage_stats.py run
    # having happened against this DB) so this test is deterministic and
    # network-independent, same discipline as the live Smogon fetch itself
    # being manually-verified rather than exercised in the automated suite —
    # see tests/test_sync_usage_stats.py's docstring.
    species_id = f"testmon{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        db.add(
            UsageStats(
                format="gen9ou",
                month="2026-05",
                species_id=species_id,
                species_name="Test Mon",
                rank=7,
                usage_percent=8.5,
                raw_count=1000,
                abilities=[],
                items=[],
                moves=[],
                tera_types=[],
                teammates=[],
                checks_and_counters=[],
            )
        )
        await db.commit()

    result = await mcp_server.call_tool("lookup_meta_stats", {"pokemon_name": species_id})
    payload = _structured_payload(result)

    assert payload["species_id"] == species_id
    assert payload["format"] == "gen9ou"
    assert payload["usage_percent"] == 8.5


async def test_lookup_meta_stats_raises_for_an_unsynced_pokemon():
    with pytest.raises(ToolError, match="No synced usage stats"):
        await mcp_server.call_tool(
            "lookup_meta_stats", {"pokemon_name": f"nonexistent{uuid4().hex[:8]}"}
        )


async def test_scout_opponent_returns_a_combined_report():
    result = await mcp_server.call_tool("scout_opponent", {"pokemon_name": "Landorus-Therian"})
    payload = _structured_payload(result)

    assert payload["species_id"] == "landorustherian"
    assert isinstance(payload["strategy_notes"], list)


async def test_suggest_teammates_returns_a_graph_derived_result():
    # Seeded directly in Neo4j (not relying on scripts/load_graph.py having
    # already run against this DB) — same self-contained-fixture discipline
    # as test_lookup_meta_stats_returns_synced_data above, just against the
    # graph store instead of Postgres. See tests/test_graph_query.py for the
    # full synthetic-graph pattern this borrows.
    from app.graph.session import run_query

    suffix = uuid4().hex[:8]
    team_id, mate_id = f"p1{suffix}", f"p2{suffix}"
    await run_query(
        "MERGE (a:Pokemon {id: $team_id}) SET a.name = $team_id "
        "MERGE (b:Pokemon {id: $mate_id}) SET b.name = $mate_id "
        "MERGE (a)-[:PAIRS_WITH {format: 'test', percent: 20.0}]->(b)",
        team_id=team_id,
        mate_id=mate_id,
    )

    result = await mcp_server.call_tool("suggest_teammates", {"team_pokemon_names": [team_id]})
    payload = _structured_payload(result)

    assert any(c["species_id"] == mate_id for c in payload["candidates"])

    await run_query(
        "MATCH (n:Pokemon) WHERE n.id IN [$team_id, $mate_id] DETACH DELETE n",
        team_id=team_id,
        mate_id=mate_id,
    )


async def test_predict_win_probability_returns_a_result_shape(monkeypatch):
    # Trains a small, throwaway model against a temp path (Python's own
    # `tempfile`, not pytest's `tmp_path` fixture — see
    # tests/test_win_probability.py's `trained_model` fixture docstring for
    # why) — same self-contained discipline as that fixture, rather than
    # depending on scripts/train_win_probability_model.py already having run
    # for real against this environment's app/data/ml/ artifact.
    with tempfile.TemporaryDirectory(prefix="masterball-win-prob-test-") as tmp_dir:
        model_path = Path(tmp_dir) / "model.json"
        monkeypatch.setattr(win_probability, "MODEL_PATH", model_path)
        monkeypatch.setattr("scripts.train_win_probability_model.MODEL_PATH", model_path)
        monkeypatch.setattr(
            "scripts.train_win_probability_model.METADATA_PATH", Path(tmp_dir) / "metadata.json"
        )
        win_probability._load_model.cache_clear()
        await train_and_save(n_samples=1500, team_size=3, seed=3)

        result = await mcp_server.call_tool(
            "predict_win_probability",
            {
                "team_a_pokemon_names": ["Landorus-Therian"],
                "team_b_pokemon_names": ["Pikachu"],
            },
        )
        payload = _structured_payload(result)

        assert 0.0 <= payload["team_a_win_probability"] <= 1.0
        assert "toy" in payload["model_note"].lower()

        win_probability._load_model.cache_clear()


async def test_predict_win_probability_raises_when_no_model_is_trained(monkeypatch):
    with tempfile.TemporaryDirectory(prefix="masterball-win-prob-test-") as tmp_dir:
        monkeypatch.setattr(win_probability, "MODEL_PATH", Path(tmp_dir) / "missing.json")
        win_probability._load_model.cache_clear()

        with pytest.raises(ToolError, match="No trained win-probability model"):
            await mcp_server.call_tool(
                "predict_win_probability",
                {"team_a_pokemon_names": ["Pikachu"], "team_b_pokemon_names": ["Pikachu"]},
            )

        win_probability._load_model.cache_clear()


def _fresh_http_app():
    """FastMCP caches one StreamableHTTPSessionManager per instance, and that
    manager's .run() (invoked by the Starlette app's lifespan) can only be
    entered once ever — so each test needing its own TestClient lifespan
    must force FastMCP to build a brand-new session manager first."""
    mcp_server._session_manager = None
    return mcp_server.streamable_http_app()


async def test_http_transport_rejects_requests_without_the_api_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "mcp_api_key", "test-secret-key")
    app = wrap_with_auth(_fresh_http_app())

    with TestClient(app) as client:
        response = client.post("/mcp", json={"jsonrpc": "2.0", "method": "tools/list", "id": 1})

    assert response.status_code == 401


async def test_http_transport_allows_requests_with_the_correct_api_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "mcp_api_key", "test-secret-key")
    app = wrap_with_auth(_fresh_http_app())

    with TestClient(app) as client:
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
            headers={
                "Authorization": "Bearer test-secret-key",
                "Accept": "application/json, text/event-stream",
            },
        )

    # A valid API key gets past the auth middleware — the request may still
    # fail MCP's own session/protocol requirements (this client doesn't do a
    # full initialize handshake), so 401 is what specifically must NOT happen.
    assert response.status_code != 401
