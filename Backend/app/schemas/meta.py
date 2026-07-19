"""Pydantic schemas for Phase 5's meta/usage-stats lookup — see
app/tools/meta_stats.py and app/models/meta.py.
"""

from pydantic import BaseModel


class UsageShare(BaseModel):
    """One entry in a top-N breakdown (currently only tera types, which have
    no useful per-entry enrichment beyond the type name itself — the type's
    own color already carries that), already normalized to a percent share
    within its own category."""

    name: str
    percent: float


class AbilityUsageShare(UsageShare):
    """A `top_abilities` entry, enriched the same way as `ItemUsageShare` but
    against the Abilities table."""

    ability_id: str | None = None
    description: str | None = None


class MoveUsageShare(UsageShare):
    """A `top_moves` entry, enriched the same way as `ItemUsageShare` but
    against the Moves table — type/category/description plus the same
    power/accuracy/PP the Pokedex's own movepool table shows, all surfaced
    in the frontend's `InfoLink` hover preview rather than as inline
    columns, which is what this compact a list actually has no room for."""

    move_id: str | None = None
    type: str | None = None
    category: str | None = None
    description: str | None = None
    base_power: int | None = None
    accuracy: int | None = None
    pp: int | None = None


class ItemUsageShare(UsageShare):
    """A `top_items` entry, enriched (in app/tools/meta_stats.py, by matching
    Smogon's display name against this app's own seeded Items table) with
    just enough to render a small item card instead of bare text."""

    item_id: str | None = None
    sprite_url: str | None = None
    short_effect: str | None = None
    """Item.description verbatim — None if the name didn't resolve to a row
    in this app's own Items table (e.g. a mega stone/Z-crystal this format
    doesn't use), not a fabricated summary."""


class PokemonUsageShare(UsageShare):
    """A `top_teammates` entry, enriched the same way as `ItemUsageShare` but
    against the Species table — Smogon's chaos stats only ever carry a
    display name here, no id, so `species_id` is derived by normalizing that
    name the same way scripts/sync_usage_stats.py already does for checks and
    counters below."""

    species_id: str | None = None
    sprite_url: str | None = None
    type1: str | None = None
    type2: str | None = None
    description: str | None = None
    """Species.description verbatim — real Pokedex flavor text, shown as the
    hover-preview blurb the same way ItemUsageShare.short_effect is."""


class CheckOrCounter(BaseModel):
    """One entry from Smogon's own "Checks and Counters" stat — real,
    aggregated-from-real-replays data (which Pokemon actually walled or KOed
    this one across real ladder games), not a heuristic this app derived
    itself. See scripts/sync_usage_stats.py."""

    name: str
    species_id: str | None = None
    """Populated only if resolvable to this app's own seeded Pokedex — None
    doesn't mean "unranked," it means the name didn't match (e.g. a forme
    Smogon stats know about that this app's Gen 9 seed doesn't)."""
    sprite_url: str | None = None
    type1: str | None = None
    type2: str | None = None
    description: str | None = None
    """Species.description verbatim, same as PokemonUsageShare.description."""
    matchups_seen: int
    """Smogon's "n" — how many recorded matchups this stat is based on."""
    beats_percent: float
    """Smogon's "p" *100 — the share of those matchups this Pokemon won/KOed
    or forced out the other, i.e. how much this one should be feared as an
    answer, not how often it was merely present."""


class MetaStatsResult(BaseModel):
    """Backs `GET /meta/{species_id}` and the `lookup_meta_stats` agent tool
    — see Docs/backend/README.md's "Meta/usage stats (Phase 5)" section."""

    species_id: str
    species_name: str
    format: str
    month: str
    rank: int
    usage_percent: float
    raw_count: int
    top_abilities: list[AbilityUsageShare]
    top_items: list[ItemUsageShare]
    top_moves: list[MoveUsageShare]
    top_tera_types: list[UsageShare]
    top_teammates: list[PokemonUsageShare]
    top_checks_and_counters: list[CheckOrCounter]
    is_demo: bool = False
    """True when this payload is the interview filler pack (no Smogon sync row)."""


class MetaLeaderboardEntry(BaseModel):
    """One row on `GET /meta` — compact enough for a homepage dashboard,
    enriched with Species types/sprites when the id resolves. Moves/items
    use the same enriched share shapes as `MetaStatsResult` so the UI can
    show real display names ("Rapid Spin") and deep-link to detail pages."""

    species_id: str
    species_name: str
    rank: int
    usage_percent: float
    raw_count: int
    sprite_url: str | None = None
    type1: str | None = None
    type2: str | None = None
    top_moves: list[MoveUsageShare]
    top_items: list[ItemUsageShare]


class TypeUsageShare(BaseModel):
    """Usage-weighted type share across the synced format roster."""

    type: str
    percent: float


class MetaLeaderboard(BaseModel):
    """Backs `GET /meta` — format-wide snapshot for the homepage dashboard."""

    format: str
    month: str | None
    """None when nothing has been synced for this format yet (or demo fallback)."""
    species_count: int
    top_usage_percent: float | None
    entries: list[MetaLeaderboardEntry]
    type_distribution: list[TypeUsageShare]
    is_demo: bool = False
    """True when this payload is the interview/local filler from
    `app.data.demo_meta` because no Smogon sync rows exist yet for the format."""


class ScoutReport(BaseModel):
    """Backs the `scout_opponent` tool — a real usage-stats profile (if
    synced) plus any relevant strategy notes, composed together rather than
    either alone. See app/tools/scout.py."""

    species_id: str
    meta_stats: MetaStatsResult | None
    """None if this Pokemon hasn't been synced yet (see
    scripts/sync_usage_stats.py) — a real "we don't have this yet," not a
    fabricated placeholder profile."""
    strategy_notes: list[str]
    """Plain citation titles from retrieve_context, kept separate from the
    full RetrievedChunk shape since this schema is meant to be compact enough
    for the agent to read directly, not re-render as its own UI."""
