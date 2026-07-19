"""lookup_meta_stats — reads the `usage_stats` table synced by
scripts/sync_usage_stats.py. Pure read/lookup, no LLM — same "deterministic
tool the agent calls" shape as app/tools/pokedex.py and app/tools/damage_calc.py.
See Docs/backend/README.md's "Meta/usage stats (Phase 5)" section.
"""

from typing import Protocol

from poke_env.data.normalize import to_id_str
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.demo_meta import DEMO_GEN9OU_LEADERBOARD, DEMO_META_MONTH
from app.models.meta import UsageStats
from app.models.pokemon import Ability, Item, Move, Species
from app.schemas.meta import (
    AbilityUsageShare,
    CheckOrCounter,
    ItemUsageShare,
    MetaLeaderboard,
    MetaLeaderboardEntry,
    MetaStatsResult,
    MoveUsageShare,
    PokemonUsageShare,
    TypeUsageShare,
    UsageShare,
)

DEFAULT_FORMAT = "gen9ou"
DEFAULT_LEADERBOARD_LIMIT = 12


class _LeaderboardRow(Protocol):
    species_id: str
    rank: int
    usage_percent: float
    raw_count: int
    moves: object
    items: object


def _raw_share_entries(raw: object, limit: int) -> list[tuple[str, float]]:
    if not isinstance(raw, list):
        return []
    out: list[tuple[str, float]] = []
    for entry in raw[:limit]:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        percent = entry.get("percent")
        if isinstance(name, str) and isinstance(percent, (int, float)):
            out.append((name, float(percent)))
    return out


def _enriched_moves(
    raw: object, moves_by_id: dict[str, Move], limit: int = 4
) -> list[MoveUsageShare]:
    """Resolve Smogon move ids to seeded display names + linkable move_id."""
    return [
        MoveUsageShare(
            name=move.name
            if (move := moves_by_id.get(to_id_str(raw_name)))
            else _unresolved_display_name(raw_name),
            percent=percent,
            move_id=move.id if move else None,
            type=move.type if move else None,
            category=move.category if move else None,
            description=move.description if move else None,
            base_power=move.base_power if move else None,
            accuracy=move.accuracy if move else None,
            pp=move.pp if move else None,
        )
        for raw_name, percent in _raw_share_entries(raw, limit)
    ]


def _enriched_items(
    raw: object, items_by_id: dict[str, Item], limit: int = 3
) -> list[ItemUsageShare]:
    """Resolve Smogon item ids to seeded display names + linkable item_id."""
    return [
        ItemUsageShare(
            name=item.name
            if (item := items_by_id.get(to_id_str(raw_name)))
            else _unresolved_display_name(raw_name),
            percent=percent,
            item_id=item.id if item else None,
            sprite_url=item.sprite_url if item else None,
            short_effect=item.description if item else None,
        )
        for raw_name, percent in _raw_share_entries(raw, limit)
    ]


async def _rows_by_id[T](db: AsyncSession, model: type[T], ids: set[str]) -> dict[str, T]:
    if not ids:
        return {}
    result = await db.execute(select(model).where(model.id.in_(ids)))
    return {row.id: row for row in result.scalars().all()}


def _unresolved_display_name(raw_id: str) -> str:
    """Last-resort formatting for the rare ability/move/item id that doesn't
    resolve against this app's own seeded tables (a genuinely new/unreleased
    one PokeAPI/poke-env don't have yet — see app/data/pokeapi_client.py's
    `ITEM_CATEGORIES` for the seeding-gap version of this same problem,
    which is the real fix; this is only the fallback for whatever's still
    left over). Smogon's chaos stats give moves/items/abilities as bare
    Showdown ids ("voltswitch"), never display text, so there's no
    properly-spaced original to fall back to the way there is for
    teammates/checks — `nothing` (Smogon's "no item held" placeholder,
    common enough to hit the top-N list on its own) is special-cased to a
    real label rather than run through this; everything else just gets its
    first letter capitalized ("Voltswitch") since a Showdown id has no
    separators left to reconstruct word boundaries from — imperfect, but
    still unambiguously better than the raw lowercase id it replaces."""
    if raw_id == "nothing":
        return "No Item"
    return raw_id[:1].upper() + raw_id[1:] if raw_id else raw_id


async def _enrich_meta_stats_from_parts(
    db: AsyncSession,
    *,
    species_id: str,
    species_name: str,
    format: str,
    month: str,
    rank: int,
    usage_percent: float,
    raw_count: int,
    abilities: list[dict],
    items: list[dict],
    moves: list[dict],
    tera_types: list[dict],
    teammates: list[dict],
    checks_and_counters: list[dict],
    is_demo: bool = False,
) -> MetaStatsResult:
    """Shared enrichment path for synced rows and local demo fallbacks."""
    ability_ids = {to_id_str(a["name"]) for a in abilities}
    abilities_by_id = await _rows_by_id(db, Ability, ability_ids)

    move_ids = {to_id_str(m["name"]) for m in moves}
    moves_by_id = await _rows_by_id(db, Move, move_ids)

    item_ids = {to_id_str(i["name"]) for i in items}
    items_by_id = await _rows_by_id(db, Item, item_ids)

    teammate_ids = {to_id_str(t["name"]) for t in teammates}
    check_ids = {c["species_id"] for c in checks_and_counters if c.get("species_id")}
    species_by_id = await _rows_by_id(db, Species, teammate_ids | check_ids)

    top_abilities = [
        AbilityUsageShare(
            name=ability.name
            if (ability := abilities_by_id.get(to_id_str(a["name"])))
            else _unresolved_display_name(a["name"]),
            percent=a["percent"],
            ability_id=ability.id if ability else None,
            description=ability.description if ability else None,
        )
        for a in abilities
    ]

    top_moves = [
        MoveUsageShare(
            name=move.name
            if (move := moves_by_id.get(to_id_str(m["name"])))
            else _unresolved_display_name(m["name"]),
            percent=m["percent"],
            move_id=move.id if move else None,
            type=move.type if move else None,
            category=move.category if move else None,
            description=move.description if move else None,
            base_power=move.base_power if move else None,
            accuracy=move.accuracy if move else None,
            pp=move.pp if move else None,
        )
        for m in moves
    ]

    top_items = [
        ItemUsageShare(
            name=item.name
            if (item := items_by_id.get(to_id_str(i["name"])))
            else _unresolved_display_name(i["name"]),
            percent=i["percent"],
            item_id=item.id if item else None,
            sprite_url=item.sprite_url if item else None,
            short_effect=item.description if item else None,
        )
        for i in items
    ]

    top_teammates = [
        PokemonUsageShare(
            name=mon.name if (mon := species_by_id.get(to_id_str(t["name"]))) else t["name"],
            percent=t["percent"],
            species_id=mon.id if mon else None,
            sprite_url=mon.sprite_url if mon else None,
            type1=mon.type1 if mon else None,
            type2=mon.type2 if mon else None,
            description=mon.description if mon else None,
        )
        for t in teammates
    ]

    top_checks_and_counters = [
        CheckOrCounter(
            **{k: v for k, v in c.items() if k not in ("name", "species_id")},
            name=mon.name if (mon := species_by_id.get(c.get("species_id"))) else c["name"],
            species_id=mon.id if mon else None,
            sprite_url=mon.sprite_url if mon else None,
            type1=mon.type1 if mon else None,
            type2=mon.type2 if mon else None,
            description=mon.description if mon else None,
        )
        for c in checks_and_counters
    ]

    return MetaStatsResult(
        species_id=species_id,
        species_name=species_name,
        format=format,
        month=month,
        rank=rank,
        usage_percent=usage_percent,
        raw_count=raw_count,
        top_abilities=top_abilities,
        top_items=top_items,
        top_moves=top_moves,
        top_tera_types=[UsageShare(**t) for t in tera_types],
        top_teammates=top_teammates,
        top_checks_and_counters=top_checks_and_counters,
        is_demo=is_demo,
    )


async def _demo_meta_stats_for_species(
    db: AsyncSession, species_id: str, format: str = DEFAULT_FORMAT
) -> MetaStatsResult | None:
    """Local demo filler when this species has no synced usage_stats row."""
    mon = (
        await db.execute(select(Species).where(Species.id == species_id))
    ).scalar_one_or_none()
    if mon is None:
        return None

    demo = next((r for r in DEMO_GEN9OU_LEADERBOARD if r["species_id"] == species_id), None)
    seed = sum(ord(c) for c in species_id) % 97

    if demo is not None:
        rank = demo["rank"]
        usage_percent = demo["usage_percent"]
        raw_count = demo["raw_count"]
        moves = list(demo["moves"])
        items = list(demo["items"])
    else:
        rank = 40 + (seed % 80)
        usage_percent = round(0.8 + (seed % 40) / 10, 2)
        raw_count = 8_000 + seed * 120
        learnable = list(mon.learnable_moves or [])
        learnable_set = set(learnable)
        # Prefer recognizable competitive staples when present in the movepool
        # so demo cards don't lead with alphabetical junk like Acid Spray.
        preferred = [
            "sludgebomb",
            "gigadrain",
            "synthesis",
            "earthpower",
            "knockoff",
            "uturn",
            "closecombat",
            "swordsdance",
            "calmmind",
            "roost",
            "stealthrock",
            "toxic",
            "protect",
        ]
        move_ids = [m for m in preferred if m in learnable_set][:4]
        if len(move_ids) < 4:
            for mid in learnable:
                if mid not in move_ids:
                    move_ids.append(mid)
                if len(move_ids) >= 4:
                    break
        moves = [
            {"name": mid, "percent": round(70 - i * 12 + (seed % 5), 1)}
            for i, mid in enumerate(move_ids)
        ] or [{"name": "protect", "percent": 55.0}]
        items = [
            {"name": "leftovers", "percent": 38.0},
            {"name": "lifeorb", "percent": 22.0},
            {"name": "heavydutyboots", "percent": 16.0},
        ]

    ability_ids = [str(v) for v in (mon.abilities or {}).values() if v][:3]
    abilities = [
        {"name": a, "percent": round(90 - i * 25, 1)} for i, a in enumerate(ability_ids)
    ] or [{"name": "pressure", "percent": 100.0}]

    tera_types = [
        {"name": (mon.type1 or "normal").lower(), "percent": 42.0},
        {"name": "steel", "percent": 18.0},
        {"name": "fairy", "percent": 12.0},
    ]

    # Teammates / checks drawn from the demo ladder pack (skip self).
    others = [r for r in DEMO_GEN9OU_LEADERBOARD if r["species_id"] != species_id]
    teammates = [
        {"name": o["species_name"], "percent": round(18 - i * 3, 1)}
        for i, o in enumerate(others[:4])
    ]
    checks_and_counters = [
        {
            "name": o["species_name"],
            "species_id": o["species_id"],
            "matchups_seen": 2000 + i * 400,
            "beats_percent": round(55 - i * 4, 1),
        }
        for i, o in enumerate(others[1:5])
    ]

    return await _enrich_meta_stats_from_parts(
        db,
        species_id=species_id,
        species_name=mon.name,
        format=format,
        month=DEMO_META_MONTH,
        rank=rank,
        usage_percent=usage_percent,
        raw_count=raw_count,
        abilities=abilities,
        items=items,
        moves=moves,
        tera_types=tera_types,
        teammates=teammates,
        checks_and_counters=checks_and_counters,
        is_demo=True,
    )


async def lookup_meta_stats(
    db: AsyncSession, species_id: str, format: str = DEFAULT_FORMAT
) -> MetaStatsResult | None:
    """Returns synced usage stats, or gen9ou demo filler when unsynced.

    None only when the species itself is unknown (not in the Pokedex seed).
    """
    result = await db.execute(
        select(UsageStats).where(UsageStats.format == format, UsageStats.species_id == species_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        if format == DEFAULT_FORMAT:
            return await _demo_meta_stats_for_species(db, species_id, format)
        return None

    return await _enrich_meta_stats_from_parts(
        db,
        species_id=row.species_id,
        species_name=row.species_name,
        format=row.format,
        month=row.month,
        rank=row.rank,
        usage_percent=row.usage_percent,
        raw_count=row.raw_count,
        abilities=list(row.abilities or []),
        items=list(row.items or []),
        moves=list(row.moves or []),
        tera_types=list(row.tera_types or []),
        teammates=list(row.teammates or []),
        checks_and_counters=list(row.checks_and_counters or []),
    )


class _DemoRow:
    """Thin adapter so demo dicts share the enrichment path with UsageStats."""

    __slots__ = ("species_id", "rank", "usage_percent", "raw_count", "moves", "items")

    def __init__(self, row: dict) -> None:
        self.species_id = row["species_id"]
        self.rank = row["rank"]
        self.usage_percent = row["usage_percent"]
        self.raw_count = row["raw_count"]
        self.moves = row["moves"]
        self.items = row["items"]


async def _build_leaderboard(
    db: AsyncSession,
    *,
    format: str,
    month: str | None,
    rows: list[_LeaderboardRow],
    limit: int,
    is_demo: bool,
) -> MetaLeaderboard:
    species_ids = {row.species_id for row in rows}
    species_by_id = await _rows_by_id(db, Species, species_ids)
    # Skip rows that aren't in this app's Pokedex (fixture leftovers like
    # "Test Mon", or Smogon-only formes) so the homepage never surfaces them.
    resolved_rows = [row for row in rows if row.species_id in species_by_id]

    if not resolved_rows:
        return MetaLeaderboard(
            format=format,
            month=month,
            species_count=0,
            top_usage_percent=None,
            entries=[],
            type_distribution=[],
            is_demo=is_demo,
        )

    type_weights: dict[str, float] = {}
    for row in resolved_rows:
        mon = species_by_id[row.species_id]
        weight = float(row.usage_percent)
        type_weights[mon.type1] = type_weights.get(mon.type1, 0.0) + weight
        if mon.type2:
            type_weights[mon.type2] = type_weights.get(mon.type2, 0.0) + weight

    total_type_weight = sum(type_weights.values()) or 1.0
    type_distribution = [
        TypeUsageShare(type=type_name, percent=round(100.0 * weight / total_type_weight, 2))
        for type_name, weight in sorted(type_weights.items(), key=lambda kv: kv[1], reverse=True)
    ]

    top_rows = resolved_rows[:limit]
    move_ids: set[str] = set()
    item_ids: set[str] = set()
    for row in top_rows:
        for raw_name, _ in _raw_share_entries(row.moves, 4):
            move_ids.add(to_id_str(raw_name))
        for raw_name, _ in _raw_share_entries(row.items, 3):
            item_ids.add(to_id_str(raw_name))
    moves_by_id = await _rows_by_id(db, Move, move_ids)
    items_by_id = await _rows_by_id(db, Item, item_ids)

    entries: list[MetaLeaderboardEntry] = []
    for row in top_rows:
        mon = species_by_id[row.species_id]
        entries.append(
            MetaLeaderboardEntry(
                species_id=row.species_id,
                species_name=mon.name,
                rank=row.rank,
                usage_percent=row.usage_percent,
                raw_count=row.raw_count,
                sprite_url=mon.sprite_url,
                type1=mon.type1,
                type2=mon.type2,
                top_moves=_enriched_moves(row.moves, moves_by_id, limit=4),
                top_items=_enriched_items(row.items, items_by_id, limit=3),
            )
        )

    return MetaLeaderboard(
        format=format,
        month=month,
        species_count=len(resolved_rows),
        top_usage_percent=resolved_rows[0].usage_percent,
        entries=entries,
        type_distribution=type_distribution,
        is_demo=is_demo,
    )


async def lookup_meta_leaderboard(
    db: AsyncSession,
    format: str = DEFAULT_FORMAT,
    limit: int = DEFAULT_LEADERBOARD_LIMIT,
) -> MetaLeaderboard:
    """Format-wide usage snapshot for the homepage dashboard — top-N by rank,
    plus a usage-weighted type distribution across every synced row.

    When `gen9ou` has never been synced, returns the local demo pack from
    `app.data.demo_meta` so the homepage is never an empty dashed box.
    """
    limit = max(1, min(limit, 50))

    all_rows = (
        await db.execute(
            select(UsageStats).where(UsageStats.format == format).order_by(UsageStats.rank.asc())
        )
    ).scalars().all()

    if not all_rows:
        if format == DEFAULT_FORMAT:
            return await _build_leaderboard(
                db,
                format=format,
                month=DEMO_META_MONTH,
                rows=[_DemoRow(row) for row in DEMO_GEN9OU_LEADERBOARD],
                limit=limit,
                is_demo=True,
            )
        return MetaLeaderboard(
            format=format,
            month=None,
            species_count=0,
            top_usage_percent=None,
            entries=[],
            type_distribution=[],
            is_demo=False,
        )

    return await _build_leaderboard(
        db,
        format=format,
        month=all_rows[0].month,
        rows=list(all_rows),
        limit=limit,
        is_demo=False,
    )
