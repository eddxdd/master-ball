"""Tests for scripts/sync_usage_stats.py. The actual live fetch from Smogon
is exercised manually (see Docs/backend/README.md's "Meta/usage stats
(Phase 5)" section) — these tests cover the parsing/normalization/upsert
logic against a small hand-built fixture shaped exactly like a real Smogon
chaos-stats JSON dump (see the module docstring's live sample), by
monkeypatching only the network call.
"""

from uuid import uuid4

import pytest

from app.db.session import AsyncSessionLocal, engine
from app.models.meta import UsageStats
from app.tools.meta_stats import lookup_meta_stats
from scripts.sync_usage_stats import _top_checks_and_counters, _top_n_as_percent, sync_usage_stats

FIXTURE_MONTH = "2026-05"


def _fixture_payload(species_a: str, species_b: str) -> dict:
    return {
        "info": {"metagame": "gen9ou", "cutoff": 1500},
        "data": {
            species_a: {
                "usage": 0.09548,
                "Raw count": 166623,
                "Abilities": {"intimidate": 101656.3},
                "Items": {"choicescarf": 22507.0, "leftovers": 7732.9},
                "Moves": {"earthquake": 72099.5, "uturn": 95718.9},
                "Tera Types": {"ground": 22786.4},
                "Teammates": {"Kingambit": 29077.5},
                "Checks and Counters": {
                    "Great Tusk": {"n": 16699.8, "p": 0.6388, "d": 0.0037},
                    "Hatterene": {"n": 4451.9, "p": 0.4307, "d": 0.0074},
                },
            },
            species_b: {
                "usage": 0.04123,
                "Raw count": 55000,
                "Abilities": {},
                "Items": {},
                "Moves": {},
                "Tera Types": {},
                "Teammates": {},
                "Checks and Counters": {},
            },
            "empty": {
                "usage": 0.5,
                "Raw count": 1,
                "Abilities": {},
                "Items": {},
                "Moves": {},
                "Tera Types": {},
                "Teammates": {},
                "Checks and Counters": {},
            },
        },
    }


def test_top_n_as_percent_normalizes_to_a_100_percent_share():
    weights = {"a": 75.0, "b": 25.0}
    result = _top_n_as_percent(weights)
    assert result == [{"name": "a", "percent": 75.0}, {"name": "b", "percent": 25.0}]


def test_top_n_as_percent_handles_empty_input():
    assert _top_n_as_percent({}) == []


def test_top_checks_and_counters_sorts_by_decisiveness_and_resolves_species_id():
    raw = {
        "Great Tusk": {"n": 100.0, "p": 0.5, "d": 0.01},
        "Iron Valiant": {"n": 50.0, "p": 0.9, "d": 0.05},
    }
    result = _top_checks_and_counters(raw)
    assert result[0]["name"] == "Iron Valiant"  # higher "d" ranks first
    assert result[0]["species_id"] == "ironvaliant"
    assert result[0]["matchups_seen"] == 50
    assert result[0]["beats_percent"] == 90.0


async def test_sync_usage_stats_upserts_real_rows_from_a_fixture_payload(
    monkeypatch: pytest.MonkeyPatch,
):
    species_a = f"Alpha Mon {uuid4().hex[:6]}"
    species_b = f"Beta Mon {uuid4().hex[:6]}"
    format_id = f"testfmt{uuid4().hex[:6]}"

    async def fake_fetch_latest_stats(client, format_id_arg, cutoff, month):  # noqa: ARG001
        return FIXTURE_MONTH, _fixture_payload(species_a, species_b)

    monkeypatch.setattr("scripts.sync_usage_stats.fetch_latest_stats", fake_fetch_latest_stats)

    count = await sync_usage_stats(format_id, 1500)
    assert count == 2  # "empty" bucket excluded

    from poke_env.data.normalize import to_id_str

    async with AsyncSessionLocal() as db:
        top = await lookup_meta_stats(db, to_id_str(species_a), format_id)
        second = await lookup_meta_stats(db, to_id_str(species_b), format_id)
    await engine.dispose()

    assert top is not None
    assert top.rank == 1  # higher usage than species_b
    assert top.month == FIXTURE_MONTH
    # Resolved against the seeded Abilities table (see lookup_meta_stats),
    # so the display name comes back properly cased, not Smogon's raw id.
    assert top.top_abilities[0].name == "Intimidate"
    assert top.top_checks_and_counters[0].name == "Hatterene"  # higher "d" than Great Tusk

    assert second is not None
    assert second.rank == 2


async def test_sync_usage_stats_is_idempotent_on_rerun(monkeypatch: pytest.MonkeyPatch):
    species = f"Rerun Mon {uuid4().hex[:6]}"
    format_id = f"testfmt{uuid4().hex[:6]}"

    async def fake_fetch(client, format_id_arg, cutoff, month):  # noqa: ARG001
        return FIXTURE_MONTH, _fixture_payload(species, f"Other {uuid4().hex[:6]}")

    monkeypatch.setattr("scripts.sync_usage_stats.fetch_latest_stats", fake_fetch)

    await sync_usage_stats(format_id, 1500)
    await sync_usage_stats(format_id, 1500)  # re-run must upsert, not duplicate

    from poke_env.data.normalize import to_id_str
    from sqlalchemy import func, select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.count())
            .select_from(UsageStats)
            .where(UsageStats.format == format_id, UsageStats.species_id == to_id_str(species))
        )
        assert result.scalar_one() == 1
    await engine.dispose()
