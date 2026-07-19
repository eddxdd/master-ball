"""The Pokedex reference tables — species, moves, abilities, natures, and the type
chart. Seeded once from poke-env's Showdown-sourced data (see scripts/seed_pokedex.py)
and shared read-only by every feature (Pokedex UI, damage calc, team analyzer, and
later the agent's tools) — see Docs/backend/README.md and Docs/roadmap.md Phase 1.
"""

from sqlalchemy import ARRAY, Float, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Species(Base):
    """One Pokedex entry per species/forme (e.g. `charizard` and `charizardmegax`
    are separate rows) — this is what makes Mega Evolution awareness a plain lookup
    rather than a special case."""

    __tablename__ = "species"
    __table_args__ = (
        # get_move_detail's "which Pokemon learn this move" query is a real
        # array-containment lookup now (`move_id = ANY(learnable_moves)`),
        # not just an in-memory field — GIN is the standard index type for
        # Postgres array/JSONB containment queries.
        Index("ix_species_learnable_moves_gin", "learnable_moves", postgresql_using="gin"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    num: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String)
    base_species: Mapped[str | None] = mapped_column(String, index=True, default=None)
    forme: Mapped[str | None] = mapped_column(String, default=None)
    type1: Mapped[str] = mapped_column(String, index=True)
    type2: Mapped[str | None] = mapped_column(String, index=True, default=None)
    base_stats: Mapped[dict] = mapped_column(JSONB)
    """{"hp": int, "atk": int, "def": int, "spa": int, "spd": int, "spe": int}"""
    abilities: Mapped[dict] = mapped_column(JSONB)
    """Slot -> ability id, e.g. {"0": "intimidate", "1": "sandforce", "H": "sheerforce"}"""
    learnable_moves: Mapped[list[str]] = mapped_column(ARRAY(String))
    """Move ids learnable in the current generation (gen 9) by any method."""
    sprite_url: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    """Real Pokedex flavor text fetched from PokeAPI at seed time — poke-env's
    bundled Showdown data has ids/mechanics only, no flavor text. See
    app/data/pokeapi_client.py's get_pokemon_descriptions. Keyed by *base*
    species at seed time (see scripts/seed_pokedex.py) since PokeAPI's
    pokemon-species resource has one entry per species, shared by every
    battle-only forme — a Mega Evolution/Gigantamax row has the same
    description as its base species, not a missing one."""
    genus: Mapped[str | None] = mapped_column(String, default=None)
    """Pokedex category line from PokeAPI, e.g. \"Emperor Pokémon\" for
    Empoleon — see get_pokemon_genera. Same base-species keying as
    description."""

    prevo: Mapped[str | None] = mapped_column(String, default=None)
    """Species id this one evolves *from*, e.g. charmeleon.prevo == "charmander"."""
    evos: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    """Species ids this one evolves *into*. Each of those species stores its own
    evolution trigger below — read evos[i]'s own evo_* fields to know how it
    evolves from this one, not this row's."""
    evo_type: Mapped[str | None] = mapped_column(String, default=None)
    """How this species evolves from its prevo: "levelFriendship", "trade",
    "useItem", "levelMove", etc. (poke-env/Showdown's own vocabulary). Null for
    species with no prevo, or the rare cases poke-env leaves untyped."""
    evo_level: Mapped[int | None] = mapped_column(Integer, default=None)
    evo_item: Mapped[str | None] = mapped_column(String, default=None)
    """Display text, e.g. "Water Stone" — not normalized to an Item id since
    not every evolution item (e.g. King's Rock) is in this app's Items table."""
    evo_move: Mapped[str | None] = mapped_column(String, default=None)
    evo_condition: Mapped[str | None] = mapped_column(String, default=None)
    """Free-text extra condition, e.g. "male", "during the day", poke-env's own
    wording — shown verbatim, not parsed."""


class Move(Base):
    __tablename__ = "moves"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String)
    """Physical | Special | Status"""
    base_power: Mapped[int | None] = mapped_column(Integer, default=None)
    accuracy: Mapped[int | None] = mapped_column(Integer, default=None)
    """Null means the move never misses (e.g. Swift, Aerial Ace)."""
    pp: Mapped[int] = mapped_column(Integer)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    target: Mapped[str] = mapped_column(String)
    flags: Mapped[dict] = mapped_column(JSONB, default=dict)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    """Real effect text fetched from PokeAPI at seed time — poke-env's bundled
    Showdown data has ids/mechanics only, no flavor/effect text. See
    app/data/pokeapi_client.py and Docs/backend/README.md's "Data seeding"."""


class Ability(Base):
    __tablename__ = "abilities"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    """Real effect text fetched from PokeAPI at seed time (see
    app/data/pokeapi_client.py) — poke-env's bundled Showdown data doesn't
    include ability flavor text, only ids/names. Null only for the handful of
    very new abilities PokeAPI hasn't catalogued yet, not by design."""


class Nature(Base):
    __tablename__ = "natures"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    increased_stat: Mapped[str | None] = mapped_column(String, default=None)
    decreased_stat: Mapped[str | None] = mapped_column(String, default=None)
    """Both null for the five neutral natures (Hardy, Docile, Serious, Bashful, Quirky)."""


class Item(Base):
    """Battle-relevant held items only (Life Orb, Choice Band, Arceus plates,
    mega stones, resist berries, ...) — see app/data/pokeapi_client.py's
    ITEM_CATEGORIES for the exact category boundary. poke-env has no item data
    at all, so this table (and its PokeAPI-sourced seed data) is this app's
    only source of item info, not just flavor text."""

    __tablename__ = "items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    category: Mapped[str] = mapped_column(String)
    """PokeAPI item-category slug, e.g. "held-items", "choice", "mega-stones"."""
    fling_power: Mapped[int | None] = mapped_column(Integer, default=None)
    sprite_url: Mapped[str | None] = mapped_column(String, default=None)


class TypeMatchup(Base):
    """One row per (attacking_type, defending_type) pair — 18x18 = 324 rows.
    Dual-type effectiveness is the product of the two relevant rows, computed at
    query time rather than pre-flattened into every type-pair combination."""

    __tablename__ = "type_matchups"

    attacking_type: Mapped[str] = mapped_column(String, primary_key=True)
    defending_type: Mapped[str] = mapped_column(String, primary_key=True)
    multiplier: Mapped[float] = mapped_column(Float)
