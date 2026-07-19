"""Syncs Phase 5's `usage_stats` table from Smogon's own publicly-published
Chaos stats dumps (https://www.smogon.com/stats/YYYY-MM/chaos/FORMAT-CUTOFF.json)
— real, freely-published, aggregate-across-real-ladder-games data (the exact
source Smogon's own site and every third-party OU tool draws from), not
scraped copyrighted analysis prose. See Docs/backend/README.md's "Meta/usage
stats (Phase 5)" section for the full design note.

This is a **scheduled/batched sync**, not a live per-request fetch — see
Docs/tech-stack.md's cost-discipline principle. In production this runs on
Arq's cron schedule (see app/worker.py); locally, it's just a re-runnable
script, same shape as scripts/seed_pokedex.py/ingest_knowledge_base.py.

Smogon typically finishes publishing a given month's stats a few days into
the *following* month, and only keeps a rolling window of recent months
online — so this walks backwards from the current month until it finds one
that actually exists (404 isn't an error here, it's an expected "not
published yet/anymore" signal), rather than hardcoding a month that will
silently go stale.

Run: uv run python -m scripts.sync_usage_stats [--format gen9ou] [--cutoff 1500] [--month 2026-05]
"""

import argparse
import asyncio
from datetime import UTC, datetime

import httpx
from poke_env.data.normalize import to_id_str
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.db.session import AsyncSessionLocal
from app.models.meta import UsageStats

STATS_BASE_URL = "https://www.smogon.com/stats"
TOP_N = 6
MONTHS_TO_TRY = 6
"""How far back to walk looking for a published snapshot before giving up —
generous enough to survive Smogon being a couple of months behind without
this script needing a manual bump."""


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = (year * 12 + (month - 1)) + delta
    return index // 12, index % 12 + 1


def _stats_url(month: str, format_id: str, cutoff: int) -> str:
    return f"{STATS_BASE_URL}/{month}/chaos/{format_id}-{cutoff}.json"


def _top_n_as_percent(weights: dict[str, float], n: int = TOP_N) -> list[dict]:
    """Smogon's chaos stats store weighted-battle-count sums per category
    (abilities/items/moves/tera types/teammates), not ready-to-display
    percentages — this normalizes to a percent share of the category's own
    total, which is what Smogon's own stats pages display."""
    total = sum(weights.values())
    if total <= 0:
        return []
    ranked = sorted(weights.items(), key=lambda kv: kv[1], reverse=True)[:n]
    return [{"name": name, "percent": round(weight / total * 100, 2)} for name, weight in ranked]


def _top_checks_and_counters(raw: dict[str, dict], n: int = TOP_N) -> list[dict]:
    """Sorted by Smogon's own "d" (decisiveness) score — their composite
    ranking metric for how much a given check/counter should actually be
    feared, not merely how often it appeared."""
    ranked = sorted(raw.items(), key=lambda kv: kv[1].get("d", 0), reverse=True)[:n]
    return [
        {
            "name": name,
            "species_id": to_id_str(name),
            "matchups_seen": round(stats.get("n", 0)),
            "beats_percent": round(stats.get("p", 0) * 100, 2),
        }
        for name, stats in ranked
    ]


async def fetch_latest_stats(
    client: httpx.AsyncClient, format_id: str, cutoff: int, month: str | None
) -> tuple[str, dict]:
    """Returns (month, raw_json). If `month` is given, fetches exactly that
    snapshot (raising if it 404s). Otherwise walks backwards from the current
    month looking for the newest one that's actually published."""
    if month is not None:
        response = await client.get(_stats_url(month, format_id, cutoff))
        response.raise_for_status()
        return month, response.json()

    now = datetime.now(UTC)
    for delta in range(MONTHS_TO_TRY):
        year, mon = _shift_month(now.year, now.month, -delta)
        candidate = f"{year:04d}-{mon:02d}"
        response = await client.get(_stats_url(candidate, format_id, cutoff))
        if response.status_code == 200:
            return candidate, response.json()

    raise RuntimeError(
        f"No published Smogon stats found for '{format_id}' cutoff {cutoff} in the last "
        f"{MONTHS_TO_TRY} months — Smogon may have renamed/retired this format, or the format "
        "id/cutoff is wrong."
    )


async def sync_usage_stats(
    format_id: str = "gen9ou", cutoff: int = 1500, month: str | None = None
) -> int:
    async with httpx.AsyncClient(timeout=60) as client:
        resolved_month, payload = await fetch_latest_stats(client, format_id, cutoff, month)

    entries = payload["data"]
    # Chaos dumps include a synthetic "empty"/"garbage collector" bucket the
    # site itself excludes from real rankings.
    entries = {name: data for name, data in entries.items() if name.lower() != "empty"}
    ranked_names = sorted(entries, key=lambda name: entries[name]["usage"], reverse=True)

    rows = []
    for rank, name in enumerate(ranked_names, start=1):
        data = entries[name]
        rows.append(
            {
                "format": format_id,
                "month": resolved_month,
                "species_id": to_id_str(name),
                "species_name": name,
                "rank": rank,
                "usage_percent": round(data["usage"] * 100, 4),
                "raw_count": round(data.get("Raw count", 0)),
                "abilities": _top_n_as_percent(data.get("Abilities", {})),
                "items": _top_n_as_percent(data.get("Items", {})),
                "moves": _top_n_as_percent(data.get("Moves", {})),
                "tera_types": _top_n_as_percent(data.get("Tera Types", {})),
                "teammates": _top_n_as_percent(data.get("Teammates", {})),
                "checks_and_counters": _top_checks_and_counters(
                    data.get("Checks and Counters", {})
                ),
            }
        )

    if not rows:
        return 0

    async with AsyncSessionLocal() as session:
        stmt = insert(UsageStats).values(rows)
        update_cols = {
            col: stmt.excluded[col]
            for col in (
                "month",
                "species_name",
                "rank",
                "usage_percent",
                "raw_count",
                "abilities",
                "items",
                "moves",
                "tera_types",
                "teammates",
                "checks_and_counters",
            )
        }
        # synced_at should reflect *this* sync, not the row's original
        # insert time — its column default only fires on a true insert, not
        # the update branch of an upsert, so it needs setting explicitly here.
        update_cols["synced_at"] = func.now()
        stmt = stmt.on_conflict_do_update(index_elements=["format", "species_id"], set_=update_cols)
        await session.execute(stmt)
        await session.commit()

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", default="gen9ou", dest="format_id")
    parser.add_argument("--cutoff", type=int, default=1500)
    parser.add_argument("--month", default=None, help="e.g. 2026-05 (defaults to latest available)")
    args = parser.parse_args()

    count = asyncio.run(sync_usage_stats(args.format_id, args.cutoff, args.month))
    print(f"Synced usage stats for {count} Pokemon ({args.format_id}, cutoff {args.cutoff}).")


if __name__ == "__main__":
    main()
