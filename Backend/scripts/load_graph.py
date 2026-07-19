"""Loads Phase 6's Neo4j knowledge graph from data this app has *already*
ingested for another purpose — Phase 1's seeded Pokedex (species/types/moves/
abilities/items/type-chart) and, where available, Phase 5's real
Smogon-usage-derived teammate/checks-and-counters data. Not a second data
source: every node/edge here traces back to Postgres tables this app already
trusts, recombined into a graph shape because "what pairs well with X, and
what does a team built around X still need to cover" is naturally a
multi-hop graph-traversal question, not naturally a single SQL join or a
vector-similarity search — see app/tools/graph_query.py for the queries this
unlocks and Docs/backend/README.md's "Knowledge graph (Phase 6)" section for
the full design note.

Idempotent — every write is a Cypher MERGE (upsert), so re-running after
`scripts/seed_pokedex.py`/`scripts/sync_usage_stats.py` pick up new/changed
data is always safe. This is a *loader* script in the same "re-runnable batch
job, not a live per-request build" mold as `scripts/ingest_knowledge_base.py`/
`scripts/sync_usage_stats.py` — see Docs/tech-stack.md's cost-discipline
principle: the graph is built once (or re-built after a data refresh), then
queried directly, never rebuilt per-request.

Run: uv run python -m scripts.load_graph [--format gen9ou]
"""

import argparse
import asyncio

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.graph.session import close_driver, get_driver
from app.models.meta import UsageStats
from app.models.pokemon import Ability, Item, Move, Species, TypeMatchup
from app.tools.meta_stats import DEFAULT_FORMAT

CONSTRAINTS = [
    "CREATE CONSTRAINT pokemon_id IF NOT EXISTS FOR (p:Pokemon) REQUIRE p.id IS UNIQUE",
    "CREATE CONSTRAINT graph_type_name IF NOT EXISTS FOR (t:Type) REQUIRE t.name IS UNIQUE",
    "CREATE CONSTRAINT move_id IF NOT EXISTS FOR (m:Move) REQUIRE m.id IS UNIQUE",
    "CREATE CONSTRAINT ability_id IF NOT EXISTS FOR (a:Ability) REQUIRE a.id IS UNIQUE",
    "CREATE CONSTRAINT item_id IF NOT EXISTS FOR (i:Item) REQUIRE i.id IS UNIQUE",
]

# Only non-neutral matchups are written as edges — a missing edge between two
# types *means* 1x/neutral, exactly like the Postgres TypeMatchup table's own
# implicit convention (see app/tools/type_chart.py), so this doesn't
# duplicate 18*18=324 mostly-uninteresting rows as graph noise.
NEUTRAL_MULTIPLIER = 1.0


async def _load_pokedex_data() -> dict:
    async with AsyncSessionLocal() as db:
        species = (await db.execute(select(Species))).scalars().all()
        moves = (await db.execute(select(Move))).scalars().all()
        abilities = (await db.execute(select(Ability))).scalars().all()
        items = (await db.execute(select(Item))).scalars().all()
        matchups = (await db.execute(select(TypeMatchup))).scalars().all()
        return {
            "species": species,
            "moves": moves,
            "abilities": abilities,
            "items": items,
            "matchups": matchups,
        }


async def _load_usage_stats(format_id: str) -> list[UsageStats]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UsageStats).where(UsageStats.format == format_id))
        return list(result.scalars().all())


async def load_graph(format_id: str = DEFAULT_FORMAT) -> dict[str, int]:
    data = await _load_pokedex_data()
    usage_rows = await _load_usage_stats(format_id)
    driver = get_driver()

    counts = {}
    async with driver.session() as session:
        for constraint in CONSTRAINTS:
            await session.run(constraint)

        type_names = sorted({s.type1 for s in data["species"]} | {m.type for m in data["moves"]})
        await session.run("UNWIND $names AS name MERGE (t:Type {name: name})", names=type_names)

        await session.run(
            """
            UNWIND $rows AS row
            MERGE (m:Move {id: row.id})
            SET m.name = row.name, m.category = row.category,
                m.base_power = row.base_power, m.accuracy = row.accuracy
            MERGE (t:Type {name: row.type})
            MERGE (m)-[:HAS_TYPE]->(t)
            """,
            rows=[
                {
                    "id": m.id,
                    "name": m.name,
                    "type": m.type,
                    "category": m.category,
                    "base_power": m.base_power,
                    "accuracy": m.accuracy,
                }
                for m in data["moves"]
            ],
        )
        counts["moves"] = len(data["moves"])

        await session.run(
            "UNWIND $rows AS row MERGE (a:Ability {id: row.id}) SET a.name = row.name",
            rows=[{"id": a.id, "name": a.name} for a in data["abilities"]],
        )
        counts["abilities"] = len(data["abilities"])

        await session.run(
            "UNWIND $rows AS row MERGE (i:Item {id: row.id}) SET i.name = row.name,"
            " i.category = row.category",
            rows=[{"id": i.id, "name": i.name, "category": i.category} for i in data["items"]],
        )
        counts["items"] = len(data["items"])

        await session.run(
            """
            UNWIND $rows AS row
            MERGE (p:Pokemon {id: row.id})
            SET p.name = row.name, p.num = row.num,
                p.hp = row.hp, p.atk = row.atk, p.def = row.def,
                p.spa = row.spa, p.spd = row.spd, p.spe = row.spe
            MERGE (t1:Type {name: row.type1})
            MERGE (p)-[:HAS_TYPE]->(t1)
            WITH p, row
            FOREACH (_ IN CASE WHEN row.type2 IS NOT NULL THEN [1] ELSE [] END |
                MERGE (t2:Type {name: row.type2})
                MERGE (p)-[:HAS_TYPE]->(t2)
            )
            """,
            # Neo4j node properties can't hold a nested map, so base_stats is
            # flattened into individual hp/atk/def/spa/spd/spe properties
            # rather than stored as a single dict-shaped property.
            rows=[
                {
                    "id": s.id,
                    "name": s.name,
                    "num": s.num,
                    "type1": s.type1,
                    "type2": s.type2,
                    "hp": s.base_stats.get("hp"),
                    "atk": s.base_stats.get("atk"),
                    "def": s.base_stats.get("def"),
                    "spa": s.base_stats.get("spa"),
                    "spd": s.base_stats.get("spd"),
                    "spe": s.base_stats.get("spe"),
                }
                for s in data["species"]
            ],
        )
        counts["pokemon"] = len(data["species"])

        ability_edges = [
            {"pokemon_id": s.id, "ability_id": ability_id, "slot": slot}
            for s in data["species"]
            for slot, ability_id in s.abilities.items()
        ]
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (p:Pokemon {id: row.pokemon_id})
            MATCH (a:Ability {id: row.ability_id})
            MERGE (p)-[r:HAS_ABILITY]->(a)
            SET r.slot = row.slot
            """,
            rows=ability_edges,
        )
        counts["pokemon_ability_edges"] = len(ability_edges)

        move_edges = [
            {"pokemon_id": s.id, "move_id": move_id}
            for s in data["species"]
            for move_id in s.learnable_moves
        ]
        # Batched in chunks — this is by far the largest edge set (every
        # Pokemon x every learnable move, tens of thousands of rows) and a
        # single UNWIND of all of it at once is unnecessarily memory-heavy
        # for both the driver and the server.
        CHUNK = 5000
        for i in range(0, len(move_edges), CHUNK):
            await session.run(
                """
                UNWIND $rows AS row
                MATCH (p:Pokemon {id: row.pokemon_id})
                MATCH (m:Move {id: row.move_id})
                MERGE (p)-[:CAN_LEARN]->(m)
                """,
                rows=move_edges[i : i + CHUNK],
            )
        counts["pokemon_move_edges"] = len(move_edges)

        evo_edges = [
            {"from_id": s.id, "to_id": evo_id} for s in data["species"] for evo_id in s.evos
        ]
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (p1:Pokemon {id: row.from_id})
            MATCH (p2:Pokemon {id: row.to_id})
            MERGE (p1)-[:EVOLVES_INTO]->(p2)
            """,
            rows=evo_edges,
        )
        counts["evolution_edges"] = len(evo_edges)

        type_edges = [
            {
                "attacking": tm.attacking_type,
                "defending": tm.defending_type,
                "multiplier": tm.multiplier,
            }
            for tm in data["matchups"]
            if tm.multiplier != NEUTRAL_MULTIPLIER
        ]
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (t1:Type {name: row.attacking})
            MATCH (t2:Type {name: row.defending})
            MERGE (t1)-[r:EFFECTIVE_AGAINST]->(t2)
            SET r.multiplier = row.multiplier
            """,
            rows=type_edges,
        )
        counts["type_matchup_edges"] = len(type_edges)

        # Real usage-derived edges (Phase 5) — omitted entirely (not zeroed
        # out) for any format that hasn't been synced yet, so the graph never
        # implies a fabricated "0% pairing" for data that simply isn't there.
        teammate_edges = []
        counter_edges = []
        species_ids = {s.id for s in data["species"]}
        for row in usage_rows:
            if row.species_id not in species_ids:
                continue
            for mate in row.teammates:
                mate_id = mate["name"].lower().replace(" ", "").replace("-", "")
                if mate_id in species_ids and mate_id != row.species_id:
                    teammate_edges.append(
                        {"a": row.species_id, "b": mate_id, "percent": mate["percent"]}
                    )
            for check in row.checks_and_counters:
                if check.get("species_id") and check["species_id"] in species_ids:
                    counter_edges.append(
                        {
                            "threat": row.species_id,
                            "counter": check["species_id"],
                            "beats_percent": check["beats_percent"],
                            "matchups_seen": check["matchups_seen"],
                        }
                    )

        if teammate_edges:
            await session.run(
                """
                UNWIND $rows AS row
                MATCH (p1:Pokemon {id: row.a})
                MATCH (p2:Pokemon {id: row.b})
                MERGE (p1)-[r:PAIRS_WITH {format: $format}]->(p2)
                SET r.percent = row.percent
                """,
                rows=teammate_edges,
                format=format_id,
            )
        counts["teammate_edges"] = len(teammate_edges)

        if counter_edges:
            await session.run(
                """
                UNWIND $rows AS row
                MATCH (threat:Pokemon {id: row.threat})
                MATCH (counter:Pokemon {id: row.counter})
                MERGE (threat)-[r:COUNTERED_BY {format: $format}]->(counter)
                SET r.beats_percent = row.beats_percent, r.matchups_seen = row.matchups_seen
                """,
                rows=counter_edges,
                format=format_id,
            )
        counts["counter_edges"] = len(counter_edges)

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", default=DEFAULT_FORMAT, dest="format_id")
    args = parser.parse_args()

    async def _run() -> None:
        counts = await load_graph(args.format_id)
        print(f"Loaded Neo4j knowledge graph (usage edges from format '{args.format_id}'):")
        for label, count in counts.items():
            print(f"  {label}: {count}")
        await close_driver()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
