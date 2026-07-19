"""Integration tests for app/tools/meta_stats.py and GET /meta/{species_id} —
against a real DB row inserted directly (not the live Smogon fetch, which is
scripts/sync_usage_stats.py's own concern — see test_sync_usage_stats.py).
Each test uses its own throwaway (format, species_id) pair so tests never
collide, and the 200-with-real-data case calls the router function directly
(rather than through TestClient) so the seed-then-read round trip runs on a
single event loop — see test_battle_log.py's docstring for why that matters
with this app's async SQLAlchemy engine.
"""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.db.session import AsyncSessionLocal, engine
from app.main import app
from app.models.meta import UsageStats
from app.routers.meta import read_meta_leaderboard, read_meta_stats
from app.tools.meta_stats import lookup_meta_leaderboard, lookup_meta_stats


def _sample_row(format_id: str, species_id: str) -> UsageStats:
    return UsageStats(
        format=format_id,
        month="2026-05",
        species_id=species_id,
        species_name="Test Mon",
        rank=1,
        usage_percent=12.3456,
        raw_count=1000,
        abilities=[{"name": "intimidate", "percent": 80.0}],
        items=[{"name": "leftovers", "percent": 40.0}],
        moves=[{"name": "earthquake", "percent": 90.0}],
        tera_types=[{"name": "ground", "percent": 30.0}],
        teammates=[{"name": "Kingambit", "percent": 15.0}],
        checks_and_counters=[
            {
                "name": "Great Tusk",
                "species_id": "greattusk",
                "matchups_seen": 500,
                "beats_percent": 60.0,
            }
        ],
    )


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


async def test_lookup_meta_stats_returns_none_when_not_synced():
    async with AsyncSessionLocal() as db:
        result = await lookup_meta_stats(db, f"nonexistent-{uuid4()}", "gen9ou")
    await engine.dispose()
    assert result is None


async def test_lookup_meta_stats_returns_a_synced_row():
    species_id = f"testmon-{uuid4().hex[:8]}"
    # Throwaway format — never write fixtures into live `gen9ou` or the
    # homepage leaderboard will surface "Test Mon" next to real OU data.
    format_id = f"testfmt-{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        db.add(_sample_row(format_id, species_id))
        await db.commit()
        result = await lookup_meta_stats(db, species_id, format_id)
    await engine.dispose()

    assert result is not None
    assert result.species_name == "Test Mon"
    assert result.usage_percent == pytest.approx(12.3456)
    # Resolved against the seeded Abilities table, so the display name comes
    # back properly cased ("Intimidate"), not Smogon's bare Showdown id.
    assert result.top_abilities[0].name == "Intimidate"
    assert result.top_abilities[0].ability_id == "intimidate"
    assert result.top_moves[0].name == "Earthquake"
    assert result.top_moves[0].move_id == "earthquake"
    assert result.top_moves[0].type == "Ground"
    assert result.top_moves[0].category == "Physical"
    assert result.top_checks_and_counters[0].species_id == "greattusk"


async def test_lookup_meta_stats_enriches_items_teammates_and_checks_with_sprites():
    """Items/teammates/checks_and_counters carry only Smogon's own display
    names — this app resolves each against its own seeded Items/Species
    tables (both real, already-seeded rows: `leftovers` and `kingambit`/
    `greattusk`) to attach sprite/type/effect info the UI can render as a
    small card instead of bare text."""
    species_id = f"testmon-{uuid4().hex[:8]}"
    format_id = f"testfmt-{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        db.add(_sample_row(format_id, species_id))
        await db.commit()
        result = await lookup_meta_stats(db, species_id, format_id)
    await engine.dispose()

    assert result is not None
    item = result.top_items[0]
    assert item.item_id == "leftovers"
    assert item.sprite_url is not None
    assert item.short_effect is not None

    ability = result.top_abilities[0]
    assert ability.ability_id == "intimidate"
    assert ability.description is not None

    move = result.top_moves[0]
    assert move.move_id == "earthquake"
    assert move.type == "Ground"
    assert move.category == "Physical"
    assert move.base_power == 100
    assert move.accuracy == 100
    assert move.pp == 10

    teammate = result.top_teammates[0]
    assert teammate.species_id == "kingambit"
    assert teammate.type1 == "Dark"
    assert teammate.sprite_url is not None
    assert teammate.description is not None

    check = result.top_checks_and_counters[0]
    assert check.species_id == "greattusk"
    assert check.type1 is not None
    assert check.sprite_url is not None
    assert check.description is not None


async def test_lookup_meta_stats_leaves_unresolvable_names_unenriched():
    """A name that doesn't match anything in this app's own seeded tables
    (e.g. a format-specific item this Gen 9 seed doesn't carry) degrades to
    all-None enrichment fields, not a crash or a guessed match. Real Smogon
    chaos stats give moves/items/abilities as bare Showdown ids, never
    display text (unlike teammates, which are real display names already)
    — this uses that realistic id-form input rather than a pre-formatted
    fixture name, so it actually exercises `_unresolved_display_name`'s
    "at least capitalize it" fallback instead of masking the behavior this
    guards (see the regression this was written for: real ids like
    "voltswitch" showing up verbatim in the UI — Docs/backend/README.md's
    Items section)."""
    species_id = f"testmon-{uuid4().hex[:8]}"
    format_id = f"testfmt-{uuid4().hex[:8]}"
    row = _sample_row(format_id, species_id)
    row.items = [{"name": "notarealitem", "percent": 40.0}]
    row.teammates = [{"name": "Not A Real Pokemon", "percent": 15.0}]
    row.abilities = [{"name": "notarealability", "percent": 40.0}]
    row.moves = [{"name": "notarealmove", "percent": 40.0}]
    async with AsyncSessionLocal() as db:
        db.add(row)
        await db.commit()
        result = await lookup_meta_stats(db, species_id, format_id)
    await engine.dispose()

    assert result is not None
    assert result.top_items[0].item_id is None
    assert result.top_items[0].sprite_url is None
    assert result.top_teammates[0].species_id is None
    assert result.top_teammates[0].sprite_url is None
    assert result.top_teammates[0].description is None
    # Falls back to a humanized (at minimum, capitalized) version of
    # Smogon's raw id rather than the crushed-together lowercase id
    # verbatim, a crash, or a silently dropped entry.
    assert result.top_abilities[0].name == "Notarealability"
    assert result.top_abilities[0].ability_id is None
    assert result.top_moves[0].name == "Notarealmove"
    assert result.top_moves[0].move_id is None
    assert result.top_items[0].name == "Notarealitem"


async def test_lookup_meta_stats_shows_no_item_instead_of_smogons_raw_placeholder():
    """Smogon's chaos stats use the literal string "nothing" for "this
    Pokemon held no item in this replay" — common enough (Pokemon that run
    no item at all, e.g. some Assault Vest-less walls) to land in the
    top-N items list on its own merits, so it can't just be filtered out
    like a lookup failure; it needs its own real label instead of either
    the raw "nothing" or a capitalized "Nothing" (which reads like an
    actual item named "Nothing" rather than the absence of one)."""
    species_id = f"testmon-{uuid4().hex[:8]}"
    format_id = f"testfmt-{uuid4().hex[:8]}"
    row = _sample_row(format_id, species_id)
    row.items = [{"name": "nothing", "percent": 12.5}]
    async with AsyncSessionLocal() as db:
        db.add(row)
        await db.commit()
        result = await lookup_meta_stats(db, species_id, format_id)
    await engine.dispose()

    assert result is not None
    assert result.top_items[0].name == "No Item"
    assert result.top_items[0].item_id is None


async def test_read_meta_stats_router_returns_synced_data():
    species_id = f"testmon-{uuid4().hex[:8]}"
    format_id = f"testfmt-{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        db.add(_sample_row(format_id, species_id))
        await db.commit()
        result = await read_meta_stats(species_id, format=format_id, db=db)
    await engine.dispose()

    assert result.species_id == species_id
    assert result.rank == 1


async def test_read_meta_stats_router_404s_when_not_synced():
    async with AsyncSessionLocal() as db:
        with pytest.raises(HTTPException) as exc_info:
            await read_meta_stats(f"nonexistent-{uuid4()}", format="gen9ou", db=db)
    await engine.dispose()
    assert exc_info.value.status_code == 404


def test_meta_stats_endpoint_404s_over_http_when_not_synced(client: TestClient):
    response = client.get(f"/meta/nonexistent-{uuid4()}")
    assert response.status_code == 404


async def test_lookup_meta_leaderboard_empty_when_nothing_synced():
    format_id = f"testfmt-{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        result = await lookup_meta_leaderboard(db, format_id, limit=10)
    await engine.dispose()

    assert result.species_count == 0
    assert result.entries == []
    assert result.type_distribution == []
    assert result.month is None
    assert result.is_demo is False


async def test_lookup_meta_leaderboard_falls_back_to_demo_for_gen9ou():
    """Homepage never ships an empty dashed box — demo pack when unsynced."""
    async with AsyncSessionLocal() as db:
        # Ensure no real gen9ou rows shadow the fallback for this assertion.
        from sqlalchemy import delete

        from app.models.meta import UsageStats

        await db.execute(delete(UsageStats).where(UsageStats.format == "gen9ou"))
        await db.commit()
        result = await lookup_meta_leaderboard(db, "gen9ou", limit=12)
    await engine.dispose()

    assert result.is_demo is True
    assert result.species_count >= 8
    assert len(result.entries) >= 8
    assert result.month is not None
    assert result.top_usage_percent is not None
    assert result.type_distribution
    assert result.entries[0].sprite_url is not None


async def test_lookup_meta_leaderboard_returns_ranked_entries():
    format_id = f"testfmt-{uuid4().hex[:8]}"
    # Use a real seeded species so type/sprite enrichment + type distribution
    # have something to join against.
    async with AsyncSessionLocal() as db:
        db.add(
            UsageStats(
                format=format_id,
                month="2026-05",
                species_id="greattusk",
                species_name="Great Tusk",
                rank=1,
                usage_percent=22.5,
                raw_count=2000,
                abilities=[{"name": "protosynthesis", "percent": 90.0}],
                items=[{"name": "leftovers", "percent": 40.0}],
                moves=[{"name": "earthquake", "percent": 80.0}],
                tera_types=[{"name": "ground", "percent": 30.0}],
                teammates=[],
                checks_and_counters=[],
            )
        )
        db.add(
            UsageStats(
                format=format_id,
                month="2026-05",
                species_id="kingambit",
                species_name="Kingambit",
                rank=2,
                usage_percent=18.0,
                raw_count=1500,
                abilities=[],
                items=[],
                moves=[{"name": "swordsdance", "percent": 70.0}],
                tera_types=[],
                teammates=[],
                checks_and_counters=[],
            )
        )
        await db.commit()
        result = await lookup_meta_leaderboard(db, format_id, limit=10)
    await engine.dispose()

    assert result.species_count == 2
    assert result.month == "2026-05"
    assert result.top_usage_percent == pytest.approx(22.5)
    assert [e.species_id for e in result.entries] == ["greattusk", "kingambit"]
    assert result.entries[0].type1 == "Ground"
    assert result.entries[0].sprite_url is not None
    assert result.entries[0].top_moves[0].name == "Earthquake"
    assert result.entries[0].top_moves[0].move_id == "earthquake"
    assert result.entries[0].top_items[0].name == "Leftovers"
    assert result.entries[0].top_items[0].item_id == "leftovers"
    assert result.type_distribution
    assert sum(t.percent for t in result.type_distribution) == pytest.approx(100.0, abs=0.2)


async def test_read_meta_leaderboard_router_returns_snapshot():
    format_id = f"testfmt-{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        # Leaderboard only surfaces rows that resolve to a seeded Species.
        db.add(
            UsageStats(
                format=format_id,
                month="2026-05",
                species_id="greattusk",
                species_name="Great Tusk",
                rank=1,
                usage_percent=22.5,
                raw_count=2000,
                abilities=[],
                items=[],
                moves=[{"name": "earthquake", "percent": 80.0}],
                tera_types=[],
                teammates=[],
                checks_and_counters=[],
            )
        )
        await db.commit()
        result = await read_meta_leaderboard(format=format_id, limit=5, db=db)
    await engine.dispose()

    assert result.species_count == 1
    assert len(result.entries) == 1
    assert result.entries[0].species_id == "greattusk"


async def test_lookup_meta_leaderboard_skips_unresolved_fixture_species():
    """Rows like pytest's "Test Mon" must not appear on the homepage board."""
    format_id = f"testfmt-{uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        db.add(_sample_row(format_id, f"testmon-{uuid4().hex[:8]}"))
        db.add(
            UsageStats(
                format=format_id,
                month="2026-05",
                species_id="kingambit",
                species_name="Kingambit",
                rank=2,
                usage_percent=18.0,
                raw_count=1500,
                abilities=[],
                items=[],
                moves=[],
                tera_types=[],
                teammates=[],
                checks_and_counters=[],
            )
        )
        await db.commit()
        result = await lookup_meta_leaderboard(db, format_id, limit=10)
    await engine.dispose()

    assert [e.species_id for e in result.entries] == ["kingambit"]
    assert result.species_count == 1
