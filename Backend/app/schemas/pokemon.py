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
    description: str | None


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
    lighter than PokemonProfile (no movepool/abilities join needed). Reused
    verbatim as the "matching Pokemon" grid on move/ability/type detail
    pages. `forme` lets the client skip national-dex official artwork for
    Mega/Gmax/regional entries (those assets are base-forme only)."""

    id: str
    name: str
    num: int
    type1: str
    type2: str | None
    sprite_url: str
    forme: str | None = None


class SpecialFormeRef(BaseModel):
    """A lightweight pointer to one of a species' in-battle-only formes
    (Mega Evolution, Gigantamax) — just enough to render a small linked
    thumbnail next to that species in the evolution chain, not a full
    `PokemonProfile` (that's what `PokemonProfile.mega_formes` is for, with
    its full stat/ability comparison). `forme` is the raw Showdown forme
    string ("Mega", "Mega-X", "Mega-Y", "Gmax", or a Gmax variant like
    "Low-Key-Gmax" for Urshifu) — shown verbatim as a small badge."""

    id: str
    name: str
    sprite_url: str
    forme: str


class EvolutionRef(BaseModel):
    """One species in an evolution chain, shown on PokemonProfile. `condition`
    describes how *this* species evolves from its own prevo (null for the
    line's root, which has no prevo) — see `_evo_condition_text` in
    app/tools/pokedex.py."""

    id: str
    name: str
    sprite_url: str
    condition: str | None
    special_formes: list[SpecialFormeRef] = []
    """This species' own Mega/Gmax formes, if any — see `_special_formes_for`
    in app/tools/pokedex.py."""


class EvolutionStage(BaseModel):
    """One depth level of a full evolution line — usually a single species,
    but more than one for a branching line (e.g. Eevee's evolutions), all
    reached from the same previous stage. See `_full_evolution_chain` in
    app/tools/pokedex.py."""

    pokemon: list[EvolutionRef]


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
    min_stats: StatBlock
    """Theoretical floor per stat at level 100 (0 IV, 0 EV, hindering nature)
    — see app/tools/stats.py's min_max_stats for the formula."""
    max_stats: StatBlock
    """Theoretical ceiling per stat at level 100 (31 IV, 252 EV, beneficial
    nature) — see app/tools/stats.py's min_max_stats for the formula."""
    abilities: list[AbilitySummary]
    learnable_moves: list[MoveSummary]
    type_matchups: list[TypeEffectiveness]
    natures: list[NatureRef]
    sprite_url: str
    description: str | None = None
    """Real Pokedex flavor text (see app/models/pokemon.py's Species.description)
    — None only for the rare species PokeAPI hasn't catalogued yet, not by
    design."""
    genus: str | None = None
    """Pokedex category line, e.g. \"Emperor Pokémon\" — see Species.genus."""
    mega_formes: list["PokemonProfile"] = []
    """Populated only for species with at least one Mega Evolution forme —
    shown inline, unconditionally, rather than gated behind a held-item
    parameter (poke-env doesn't expose item data, and pre-computed/always-
    visible Mega stats is the actual product requirement — see
    Docs/product-research.md's Mega Evolution pain point)."""
    evolution_chain: list[EvolutionStage] = []
    """The species' *entire* evolution line, root to final stage(s) — not just
    its immediate prevo/next evolution — so a mid-line Pokemon's detail page
    (e.g. viewing Charmeleon) still shows the full Charmander → Charmeleon →
    Charizard line, not just its direct neighbors. See
    `_full_evolution_chain` in app/tools/pokedex.py."""


class MoveDetail(MoveSummary):
    """get_move_detail's output — a Move plus every Pokemon that can learn it."""

    learned_by: list[PokemonSummary]


class AbilityDetail(AbilitySummary):
    """get_ability_detail's output — an Ability plus every Pokemon that can have it."""

    pokemon: list[PokemonSummary]


class TypeDetail(BaseModel):
    """get_type_detail's output — a type's full matchup chart in both
    directions plus every Pokemon of that type."""

    type: str
    attacking: list[TypeEffectiveness]
    """How effective this type's moves are against each other type."""
    defending: list[TypeEffectiveness]
    """How effective each other type's moves are against this type."""
    pokemon: list[PokemonSummary]
