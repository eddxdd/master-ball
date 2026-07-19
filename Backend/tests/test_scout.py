"""Tests for app/tools/scout.py — scout_opponent's composition of
lookup_meta_stats + retrieve_context. Uses the real seeded knowledge base
(Landorus-Therian has a real strategy doc — see
app/data/knowledge_base/landorus-therian.md) so this exercises real
retrieval, not a mock.
"""

from uuid import uuid4

from app.db.session import AsyncSessionLocal, engine
from app.models.meta import UsageStats
from app.tools.scout import scout_opponent


async def test_scout_opponent_returns_none_meta_stats_when_not_synced():
    async with AsyncSessionLocal() as db:
        report = await scout_opponent(db, f"NonexistentMon{uuid4().hex[:6]}")
    await engine.dispose()

    assert report.meta_stats is None
    # Even with no meta stats synced, retrieval should still run and (since
    # the query mentions the made-up name) simply return whatever's closest
    # semantically — never raise just because meta stats are missing.
    assert isinstance(report.strategy_notes, list)


async def test_scout_opponent_finds_real_strategy_notes_for_a_known_pokemon():
    async with AsyncSessionLocal() as db:
        report = await scout_opponent(db, "Landorus-Therian")
    await engine.dispose()

    assert report.species_id == "landorustherian"
    assert len(report.strategy_notes) > 0


async def test_scout_opponent_includes_synced_meta_stats_when_available():
    # No hyphen: scout_opponent runs the input through to_id_str (which
    # strips hyphens/spaces), so the seeded row's species_id must already be
    # in that normalized form for the lookup to match.
    species_id = f"testmon{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        db.add(
            UsageStats(
                format="gen9ou",
                month="2026-05",
                species_id=species_id,
                species_name="Test Mon",
                rank=42,
                usage_percent=5.0,
                raw_count=100,
                abilities=[],
                items=[],
                moves=[],
                tera_types=[],
                teammates=[],
                checks_and_counters=[],
            )
        )
        await db.commit()
        report = await scout_opponent(db, species_id)
    await engine.dispose()

    assert report.meta_stats is not None
    assert report.meta_stats.species_name == "Test Mon"
