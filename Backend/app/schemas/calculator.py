"""Schemas for the calculate_damage tool. See Docs/backend/damage-calc.md for
the exact formula scope (what's implemented vs. explicitly deferred)."""

from typing import Literal

from pydantic import BaseModel, Field

Status = Literal["brn", "psn", "tox", "par", "slp", "frz"]


class PokemonBattleState(BaseModel):
    """A Pokemon set as used in a single damage calculation — deliberately
    lighter-weight than the Team Builder's PokemonSet (see app/schemas/team.py),
    since a calculator query doesn't need moves other than the one being used."""

    species_id: str
    level: int = 100
    nature: str = "hardy"
    evs: dict[str, int] = Field(default_factory=dict)
    """Missing stat keys default to 0. Not strictly validated against the real
    508 total / 252 per-stat caps — see Docs/backend/damage-calc.md."""
    ivs: dict[str, int] = Field(default_factory=dict)
    """Missing stat keys default to 31 (perfect IVs)."""
    ability: str | None = None
    """Defaults to the species' first ability slot ("0") if not given."""
    item: str | None = None
    status: Status | None = None
    tera_type: str | None = None
    stat_stages: dict[str, int] = Field(default_factory=dict)
    """atk/def/spa/spd/spe -> -6..6. HP is not a valid key (HP has no stages)."""
    current_hp_percent: float = 100.0
    """For KO-chance context — e.g. "can this already-damaged Pokemon finish
    off a target at 40% HP." Defaults to full HP."""


class FieldConditions(BaseModel):
    weather: Literal["sun", "rain"] | None = None
    reflect: bool = False
    light_screen: bool = False
    aurora_veil: bool = False
    is_critical: bool = False
    spread_move: bool = False
    """The 0.75x reduction for a move hitting multiple targets in a doubles
    battle — a manual flag rather than full VGC doubles-targeting simulation,
    see Docs/backend/damage-calc.md."""


class DamageCalcRequest(BaseModel):
    attacker: PokemonBattleState
    defender: PokemonBattleState
    move_id: str
    field: FieldConditions = Field(default_factory=FieldConditions)


class DamageCalcResult(BaseModel):
    move_name: str
    move_type: str
    category: str
    is_immune: bool
    type_effectiveness: float
    stab_multiplier: float
    rolls: list[int]
    """The 16 damage values for the 85%-100% random roll, in raw HP."""
    min_damage: int
    max_damage: int
    min_percent: float
    max_percent: float
    defender_max_hp: int
    ko_chance_description: str
