"""get_pokemon_profile and list_pokemon — the Pokedex tools.

Deterministic, no LLM involved (see Docs/architecture.md's "Tools" section).
Plain async functions taking a session, so the exact same implementation backs
the REST endpoints now and the agent/MCP tool-calling layers later, per
Docs/ai-agents-and-rag.md.
"""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.generations import dex_range_for_generation
from app.models import Ability, Move, Nature, Species
from app.schemas.pokemon import (
    AbilityDetail,
    AbilitySummary,
    EvolutionRef,
    EvolutionStage,
    MoveDetail,
    MoveSummary,
    NatureRef,
    PokemonProfile,
    PokemonSummary,
    SpecialFormeRef,
    StatBlock,
    TypeDetail,
    TypeEffectiveness,
)
from app.tools.stats import min_max_stats
from app.tools.type_chart import (
    ALL_TYPES,
    compute_attacking_matchups,
    compute_matchups,
    get_type_chart,
)


def _summary(s: Species) -> PokemonSummary:
    return PokemonSummary(
        id=s.id,
        name=s.name,
        num=s.num,
        type1=s.type1,
        type2=s.type2,
        sprite_url=s.sprite_url,
        forme=s.forme,
    )


_MEGA_FORMES = {"Mega", "Mega-X", "Mega-Y"}

# Event outfits / skins that never change typing or stats (Pikachu cosplay,
# Vivillon event patterns, etc.). Real regional formes use Alola/Galar/Hisui/
# Paldea and are kept — Pikachu's "Alola" cap is handled separately below.
_COSMETIC_FORMES = frozenset(
    {
        "Belle",
        "Cosplay",
        "Libre",
        "PhD",
        "Pop-Star",
        "Rock-Star",
        "Partner",
        "Starter",
        "World",
        "Dada",
        "Spiky-eared",
        "Fancy",
        "Pokeball",
        "Totem",
    }
)

# Ash's cap Pikachu series — Showdown tags these with region names, but they
# are hat cosmetics, not Alolan/Galarian regional formes (those change typing).
_PIKACHU_CAP_FORMES = frozenset(
    {
        "Original",
        "Hoenn",
        "Sinnoh",
        "Unova",
        "Kalos",
        "Alola",
        "Partner",
        "Starter",
        "World",
        "Belle",
        "Cosplay",
        "Libre",
        "PhD",
        "Pop-Star",
        "Rock-Star",
    }
)


def _is_special_battle_forme(forme: str | None) -> bool:
    """True for official in-battle-only formes — Mega Evolution and
    Gigantamax — as opposed to poke-env/Showdown's data also bundling a
    long tail of fan-made "CAP" formes with confusingly similar names (e.g.
    Garchomp's non-canonical "Mega-Z", Tatsugiri's "Curly-Mega") that would
    otherwise slip through a loose `forme.startswith("Mega")` check."""
    if forme is None:
        return False
    return forme in _MEGA_FORMES or forme == "Gmax" or forme.endswith("-Gmax")


def _is_browsable_species(s: Species) -> bool:
    """Species rows worth showing in list/search UIs — default formes, real
    regionals, Mega/Gmax, and other mechanical alternates. Drops outfit/hat
    cosmetics, Totem reskins, and Showdown's forme=None color aliases
    (Vivillon patterns, Flabebe colors, Furfrou cuts, …)."""
    # Cosmetic aliases: separate ids, same display name, no forme tag.
    if s.base_species is not None and s.forme is None:
        return False
    if s.forme is None:
        return True
    if s.forme in _COSMETIC_FORMES or s.forme.endswith("-Totem"):
        return False
    if s.base_species == "pikachu" and s.forme in _PIKACHU_CAP_FORMES:
        return False
    return True


def _dedupe_gmax_by_name(species: list[Species]) -> list[Species]:
    """Collapse cap-linked Gmax duplicates (many `Pikachu-Gmax` rows) to the
    shortest id — same idea as `_special_formes_for`."""
    gmax_by_name: dict[str, Species] = {}
    kept: list[Species] = []
    for s in species:
        if s.forme == "Gmax" or (s.forme is not None and s.forme.endswith("-Gmax")):
            existing = gmax_by_name.get(s.name)
            if existing is None or len(s.id) < len(existing.id):
                gmax_by_name[s.name] = s
        else:
            kept.append(s)
    kept.extend(gmax_by_name.values())
    kept.sort(key=lambda s: (s.num, s.id))
    return kept


def _browsable_summaries(species: list[Species]) -> list[PokemonSummary]:
    browsable = [s for s in species if _is_browsable_species(s)]
    return [_summary(s) for s in _dedupe_gmax_by_name(browsable)]


async def list_pokemon(
    db: AsyncSession,
    search: str | None = None,
    type_filter: str | None = None,
    generation: int | None = None,
) -> list[PokemonSummary]:
    """Backs the Pokedex browser's list/search view."""
    stmt = select(Species).order_by(Species.num, Species.id)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(Species.id.like(like), Species.name.ilike(f"%{search}%")))
    if type_filter:
        stmt = stmt.where(or_(Species.type1 == type_filter, Species.type2 == type_filter))
    if generation is not None and (dex_range := dex_range_for_generation(generation)):
        start, end = dex_range
        stmt = stmt.where(Species.num.between(start, end))

    result = await db.execute(stmt)
    return _browsable_summaries(list(result.scalars().all()))


async def _type_matchups_for(
    db: AsyncSession, type1: str, type2: str | None
) -> list[TypeEffectiveness]:
    type_chart = await get_type_chart(db)
    combined = compute_matchups(type1, type2, type_chart)
    return [TypeEffectiveness(type=t, multiplier=m) for t, m in combined.items()]


async def _special_formes_for(db: AsyncSession, species_id: str) -> list[SpecialFormeRef]:
    """A species' own Mega/Gmax formes, lightweight — used both to decorate
    evolution-chain nodes and (filtered further to Mega-only) to build
    `PokemonProfile.mega_formes`."""
    result = await db.execute(select(Species).where(Species.base_species == species_id))
    candidates = [
        s
        for s in result.scalars().all()
        if _is_special_battle_forme(s.forme) and _is_browsable_species(s)
    ]

    # Cosmetic cap-only reskins (Pikachu alone has ~15 event-cap Gmax rows,
    # e.g. "Pikachu-Gmax" from both `pikachugmax` and `pikachu-alola-gmax`)
    # all share the same display name and forme — collapse down to one
    # canonical entry per name, preferring the shortest id (the plain one,
    # not a -alola-/-hoenn-/...-capped variant).
    by_name: dict[str, Species] = {}
    for s in candidates:
        existing = by_name.get(s.name)
        if existing is None or len(s.id) < len(existing.id):
            by_name[s.name] = s

    return [
        SpecialFormeRef(id=s.id, name=s.name, sprite_url=s.sprite_url, forme=s.forme)
        for s in sorted(by_name.values(), key=lambda s: s.forme or "")
    ]


def _evo_condition_text(species: Species) -> str | None:
    """A species stores *its own* evolution trigger (how it evolved from its
    prevo) in poke-env/Showdown's vocabulary — evo_type/evo_level/evo_item/
    evo_move/evo_condition. Combined here into one human-readable string.
    Not every one-off condition gets bespoke phrasing (Showdown's own
    "other"-typed conditions are a long tail of unique text); joining
    whatever fields are present covers all of them reasonably."""
    if species.prevo is None:
        return None

    if species.evo_type == "trade":
        return f"Trade {species.evo_condition}" if species.evo_condition else "Trade"

    if species.evo_type == "useItem" and species.evo_item:
        return f"Use {species.evo_item}"

    if species.evo_type == "levelFriendship" and not species.evo_level:
        return "High Friendship"

    # Every remaining case ("levelHold", "levelMove", "levelExtra", "other",
    # or a plain numeric level with no evo_type at all) is level-up-based.
    parts = [f"Level {species.evo_level}" if species.evo_level else "Level up"]
    if species.evo_item:
        parts.append(f"holding {species.evo_item}")
    if species.evo_move:
        parts.append(f"knowing {species.evo_move}")
    if species.evo_condition:
        parts.append(species.evo_condition)
    return " ".join(parts)


async def _full_evolution_chain(db: AsyncSession, species: Species) -> list[EvolutionStage]:
    """Returns `species`' entire evolution line as a list of depth-ordered
    stages (root first), not just its immediate prevo/next evolution — so
    viewing any stage of a 3+-stage line (or any endpoint) still shows every
    other stage. A stage holds more than one Pokemon only for a branching
    line (e.g. Eevee's evolutions), all reached from the same previous
    stage.

    Two passes: walk `prevo` links up to the line's root (no further
    `prevo`), then breadth-first back down through `evos` from that root.
    Each non-root species carries its own evolution trigger fields (how *it*
    evolves from its prevo — see `_evo_condition_text`'s docstring), so the
    condition on every node is computed from that node itself."""
    root = species
    seen_ids = {species.id}
    while root.prevo and root.prevo not in seen_ids:
        result = await db.execute(select(Species).where(Species.id == root.prevo))
        prevo_species = result.scalar_one_or_none()
        if prevo_species is None:
            break
        root = prevo_species
        seen_ids.add(root.id)

    levels: list[list[Species]] = [[root]]
    seen_ids = {root.id}
    frontier = [root]
    while frontier:
        next_ids = [
            evo_id for node in frontier for evo_id in node.evos if evo_id not in seen_ids
        ]
        if not next_ids:
            break
        result = await db.execute(select(Species).where(Species.id.in_(next_ids)))
        next_species = sorted(result.scalars().all(), key=lambda s: s.num)
        seen_ids.update(s.id for s in next_species)
        levels.append(next_species)
        frontier = next_species

    return [
        EvolutionStage(
            pokemon=[
                EvolutionRef(
                    id=s.id,
                    name=s.name,
                    sprite_url=s.sprite_url,
                    condition=_evo_condition_text(s),
                    special_formes=await _special_formes_for(db, s.id),
                )
                for s in level
            ]
        )
        for level in levels
    ]


async def _build_profile(
    db: AsyncSession, species: Species, *, include_mega: bool
) -> PokemonProfile:
    moves_result = await db.execute(select(Move).where(Move.id.in_(species.learnable_moves)))
    moves = sorted(moves_result.scalars().all(), key=lambda m: m.name)

    ability_ids = list(species.abilities.values())
    abilities_result = await db.execute(select(Ability).where(Ability.id.in_(ability_ids)))
    abilities_by_id = {a.id: a for a in abilities_result.scalars().all()}
    abilities = [
        AbilitySummary(
            id=ability_id,
            name=(known.name if (known := abilities_by_id.get(ability_id)) else ability_id),
            description=known.description if known else None,
        )
        for ability_id in ability_ids
    ]

    natures_result = await db.execute(select(Nature).order_by(Nature.name))
    natures = [
        NatureRef(
            id=n.id, name=n.name, increased_stat=n.increased_stat, decreased_stat=n.decreased_stat
        )
        for n in natures_result.scalars().all()
    ]

    type_matchups = await _type_matchups_for(db, species.type1, species.type2)
    evolution_chain = await _full_evolution_chain(db, species)
    min_stats, max_stats = min_max_stats(species.base_stats)

    mega_formes: list[PokemonProfile] = []
    if include_mega:
        mega_result = await db.execute(select(Species).where(Species.base_species == species.id))
        for mega_species in mega_result.scalars().all():
            if mega_species.forme in _MEGA_FORMES:
                mega_formes.append(await _build_profile(db, mega_species, include_mega=False))

    return PokemonProfile(
        id=species.id,
        name=species.name,
        num=species.num,
        base_species=species.base_species,
        forme=species.forme,
        type1=species.type1,
        type2=species.type2,
        base_stats=StatBlock.model_validate(species.base_stats),
        min_stats=StatBlock.model_validate(min_stats),
        max_stats=StatBlock.model_validate(max_stats),
        abilities=abilities,
        learnable_moves=[
            MoveSummary(
                id=m.id,
                name=m.name,
                type=m.type,
                category=m.category,
                base_power=m.base_power,
                accuracy=m.accuracy,
                pp=m.pp,
                priority=m.priority,
                target=m.target,
                description=m.description,
            )
            for m in moves
        ],
        type_matchups=type_matchups,
        natures=natures,
        sprite_url=species.sprite_url,
        description=species.description,
        genus=species.genus,
        mega_formes=mega_formes,
        evolution_chain=evolution_chain,
    )


async def get_pokemon_profile(db: AsyncSession, species_id: str) -> PokemonProfile | None:
    result = await db.execute(select(Species).where(Species.id == species_id))
    species = result.scalar_one_or_none()
    if species is None:
        return None
    return await _build_profile(db, species, include_mega=True)


async def list_moves(db: AsyncSession) -> list[MoveSummary]:
    """Full move catalog for the Pokedex Moves tab — client filters locally."""
    result = await db.execute(select(Move).order_by(Move.name, Move.id))
    return [
        MoveSummary(
            id=m.id,
            name=m.name,
            type=m.type,
            category=m.category,
            base_power=m.base_power,
            accuracy=m.accuracy,
            pp=m.pp,
            priority=m.priority,
            target=m.target,
            description=m.description,
        )
        for m in result.scalars().all()
    ]


async def list_abilities(db: AsyncSession) -> list[AbilitySummary]:
    """Full ability catalog for the Pokedex Abilities tab."""
    result = await db.execute(select(Ability).order_by(Ability.name, Ability.id))
    return [
        AbilitySummary(id=a.id, name=a.name, description=a.description)
        for a in result.scalars().all()
    ]


async def get_move_detail(db: AsyncSession, move_id: str) -> MoveDetail | None:
    move = await db.get(Move, move_id)
    if move is None:
        return None

    result = await db.execute(
        select(Species)
        .where(Species.learnable_moves.any(move_id))
        .order_by(Species.num, Species.id)
    )
    learned_by = _browsable_summaries(list(result.scalars().all()))
    return MoveDetail(
        id=move.id,
        name=move.name,
        type=move.type,
        category=move.category,
        base_power=move.base_power,
        accuracy=move.accuracy,
        pp=move.pp,
        priority=move.priority,
        target=move.target,
        description=move.description,
        learned_by=learned_by,
    )


async def get_ability_detail(db: AsyncSession, ability_id: str) -> AbilityDetail | None:
    ability = await db.get(Ability, ability_id)
    if ability is None:
        return None

    result = await db.execute(
        select(Species)
        .where(
            or_(
                Species.abilities["0"].astext == ability_id,
                Species.abilities["1"].astext == ability_id,
                Species.abilities["H"].astext == ability_id,
            )
        )
        .order_by(Species.num, Species.id)
    )
    pokemon = _browsable_summaries(list(result.scalars().all()))
    return AbilityDetail(
        id=ability.id, name=ability.name, description=ability.description, pokemon=pokemon
    )


async def get_type_detail(db: AsyncSession, type_name: str) -> TypeDetail | None:
    normalized = type_name.capitalize()
    if normalized not in ALL_TYPES:
        return None

    type_chart = await get_type_chart(db)
    attacking = compute_attacking_matchups(normalized, type_chart)
    defending = compute_matchups(normalized, None, type_chart)
    pokemon = await list_pokemon(db, type_filter=normalized)

    return TypeDetail(
        type=normalized,
        attacking=[TypeEffectiveness(type=t, multiplier=m) for t, m in attacking.items()],
        defending=[TypeEffectiveness(type=t, multiplier=m) for t, m in defending.items()],
        pokemon=pokemon,
    )
