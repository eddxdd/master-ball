"""Tests for scripts/load_graph.py against the real seeded Postgres Pokedex
data and the real Neo4j instance — same "run the real loader against real
data" discipline as tests/test_ragas_eval.py running the real retrieval
pipeline. Doesn't assert exact counts (those depend on how much of the
Pokedex/usage-stats data happens to be seeded/synced in a given environment)
— just that a real run succeeds, writes real Pokemon/Type nodes, and is
idempotent on a second run.
"""

from app.graph.session import run_query
from scripts.load_graph import load_graph


async def test_load_graph_writes_real_pokemon_and_type_nodes():
    counts = await load_graph()

    assert counts["pokemon"] > 0
    assert counts["moves"] > 0
    assert counts["type_matchup_edges"] > 0

    rows = await run_query(
        "MATCH (p:Pokemon {id: 'landorustherian'})-[:HAS_TYPE]->(t:Type) RETURN t.name AS name"
    )
    assert {row["name"] for row in rows} == {"Ground", "Flying"}


async def test_load_graph_is_idempotent_on_a_second_run():
    first = await load_graph()
    second = await load_graph()
    assert first == second

    rows = await run_query("MATCH (p:Pokemon {id: 'landorustherian'}) RETURN count(p) AS n")
    assert rows[0]["n"] == 1  # MERGE, never a duplicate node
