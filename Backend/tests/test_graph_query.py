"""Tests for app/tools/graph_query.py's suggest_teammates against a small,
fully synthetic slice of the graph — seeded directly via Cypher (unique
uuid-suffixed type/Pokemon names) rather than relying on
scripts/load_graph.py already having run with real Smogon-usage data synced,
so this is deterministic and independent of what's actually been loaded
into the shared dev/CI Neo4j instance. Mirrors tests/test_meta_stats.py's
"seed a fixture row directly" discipline, just against Neo4j instead of
Postgres. Cleans up its own nodes/edges afterward so repeated test runs
don't accumulate graph bloat.
"""

from uuid import uuid4

import pytest

from app.graph.session import run_query
from app.tools.graph_query import suggest_teammates


@pytest.fixture
async def synthetic_graph():
    """Builds: team member P1 (type TFire) is weak to attacking type TWater
    (2x); type TGrass resists TWater (0.5x) and P2 has type TGrass (a
    resist-only candidate); P1 also real-pairs with P3 via a synthetic
    PAIRS_WITH edge (a usage-stats-only candidate, no type relevance)."""
    suffix = uuid4().hex[:8]
    ids = {
        "fire": f"TFire{suffix}",
        "water": f"TWater{suffix}",
        "grass": f"TGrass{suffix}",
        "p1": f"p1testmon{suffix}",
        "p2": f"p2testmon{suffix}",
        "p3": f"p3testmon{suffix}",
    }
    await run_query(
        """
        MERGE (fire:Type {name: $fire})
        MERGE (water:Type {name: $water})
        MERGE (grass:Type {name: $grass})
        MERGE (water)-[:EFFECTIVE_AGAINST {multiplier: 2.0}]->(fire)
        MERGE (water)-[:EFFECTIVE_AGAINST {multiplier: 0.5}]->(grass)
        MERGE (p1:Pokemon {id: $p1}) SET p1.name = $p1
        MERGE (p2:Pokemon {id: $p2}) SET p2.name = $p2
        MERGE (p3:Pokemon {id: $p3}) SET p3.name = $p3
        MERGE (p1)-[:HAS_TYPE]->(fire)
        MERGE (p2)-[:HAS_TYPE]->(grass)
        MERGE (p1)-[:PAIRS_WITH {format: "test", percent: 12.5}]->(p3)
        """,
        **ids,
    )
    yield ids
    await run_query(
        """
        MATCH (n) WHERE n.name IN [$fire, $water, $grass] OR n.id IN [$p1, $p2, $p3]
        DETACH DELETE n
        """,
        **ids,
    )


async def test_suggest_teammates_finds_a_type_resist_candidate(synthetic_graph):
    ids = synthetic_graph
    result = await suggest_teammates([ids["p1"]])

    assert any(w.type == ids["water"] and w.weak_member_count == 1 for w in result.team_weaknesses)
    resist_candidate = next(c for c in result.candidates if c.species_id == ids["p2"])
    assert any(ids["water"] in reason for reason in resist_candidate.reasons)


async def test_suggest_teammates_finds_a_usage_pairing_candidate(synthetic_graph):
    ids = synthetic_graph
    result = await suggest_teammates([ids["p1"]])

    pairing_candidate = next(c for c in result.candidates if c.species_id == ids["p3"])
    assert pairing_candidate.score == pytest.approx(12.5)
    assert any("paired" in reason.lower() for reason in pairing_candidate.reasons)


async def test_suggest_teammates_excludes_existing_team_members(synthetic_graph):
    ids = synthetic_graph
    result = await suggest_teammates([ids["p1"], ids["p3"]])
    candidate_ids = {c.species_id for c in result.candidates}
    assert ids["p1"] not in candidate_ids
    assert ids["p3"] not in candidate_ids


async def test_suggest_teammates_returns_empty_result_for_an_empty_team():
    result = await suggest_teammates([])
    assert result.team_weaknesses == []
    assert result.candidates == []
