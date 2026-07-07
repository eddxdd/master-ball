"""Pydantic schemas shared by the Pokedex tool, its REST endpoints, and (later)
the agent/MCP layers — see Docs/architecture.md's "one implementation, three
surfaces" principle."""

from pydantic import BaseModel, ConfigDict, Field


class StatBlock(BaseModel):
    hp: int
    atk: int
    def_: int = Field(alias="def")
    spa: int
    spd: int
    spe: int

    model_config = ConfigDict(populate_by_name=True)


class MoveSummary(BaseModel):
    id: str
    name: str
    type: str
    category: str
    base_power: int | None
    accuracy: int | None
    pp: int
    priority: int
    target: str


class AbilitySummary(BaseModel):
    id: str
    name: str
    description: str | None


class NatureRef(BaseModel):
    id: str
    name: str
    increased_stat: str | None
    decreased_stat: str | None


class TypeEffectiveness(BaseModel):
    type: str
    multiplier: float


class PokemonSummary(BaseModel):
    """Row shape for the Pokedex browser's list/search view — deliberately
    lighter than PokemonProfile (no movepool/abilities join needed)."""

    id: str
    name: str
    num: int
    type1: str
    type2: str | None
    sprite_url: str


class PokemonProfile(BaseModel):
    """The full get_pokemon_profile output — base stats, full movepool,
    abilities, type matchups, and a natures reference, all in one call, per
    Docs/ai-agents-and-rag.md's tool contract."""

    id: str
    name: str
    num: int
    base_species: str | None
    forme: str | None
    type1: str
    type2: str | None
    base_stats: StatBlock
    abilities: list[AbilitySummary]
    learnable_moves: list[MoveSummary]
    type_matchups: list[TypeEffectiveness]
    natures: list[NatureRef]
    sprite_url: str
    mega_formes: list["PokemonProfile"] = []
    """Populated only for species with at least one Mega Evolution forme —
    shown inline, unconditionally, rather than gated behind a held-item
    parameter (poke-env doesn't expose item data, and pre-computed/always-
    visible Mega stats is the actual product requirement — see
    Docs/product-research.md's Mega Evolution pain point)."""
