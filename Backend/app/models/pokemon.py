"""The Pokedex reference tables — species, moves, abilities, natures, and the type
chart. Seeded once from poke-env's Showdown-sourced data (see scripts/seed_pokedex.py)
and shared read-only by every feature (Pokedex UI, damage calc, team analyzer, and
later the agent's tools) — see Docs/backend/README.md and Docs/roadmap.md Phase 1.
"""

from sqlalchemy import ARRAY, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Species(Base):
    """One Pokedex entry per species/forme (e.g. `charizard` and `charizardmegax`
    are separate rows) — this is what makes Mega Evolution awareness a plain lookup
    rather than a special case."""

    __tablename__ = "species"

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


class Ability(Base):
    __tablename__ = "abilities"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    """Populated for a curated common-competitive subset only — poke-env's data
    doesn't include ability flavor text, only ids/names. See Docs/backend/damage-calc.md."""


class Nature(Base):
    __tablename__ = "natures"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    increased_stat: Mapped[str | None] = mapped_column(String, default=None)
    decreased_stat: Mapped[str | None] = mapped_column(String, default=None)
    """Both null for the five neutral natures (Hardy, Docile, Serious, Bashful, Quirky)."""


class TypeMatchup(Base):
    """One row per (attacking_type, defending_type) pair — 18x18 = 324 rows.
    Dual-type effectiveness is the product of the two relevant rows, computed at
    query time rather than pre-flattened into every type-pair combination."""

    __tablename__ = "type_matchups"

    attacking_type: Mapped[str] = mapped_column(String, primary_key=True)
    defending_type: Mapped[str] = mapped_column(String, primary_key=True)
    multiplier: Mapped[float] = mapped_column(Float)
