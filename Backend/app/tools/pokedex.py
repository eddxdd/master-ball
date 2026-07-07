"""get_pokemon_profile and list_pokemon — the Pokedex tools.

Deterministic, no LLM involved (see Docs/architecture.md's "Tools" section).
Plain async functions taking a session, so the exact same implementation backs
the REST endpoints now and the agent/MCP tool-calling layers later, per
Docs/ai-agents-and-rag.md.
"""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ability, Move, Nature, Species
from app.schemas.pokemon import (
    AbilitySummary,
    MoveSummary,
    NatureRef,
    PokemonProfile,
    PokemonSummary,
    StatBlock,
    TypeEffectiveness,
)
from app.tools.type_chart import compute_matchups, get_type_chart


async def list_pokemon(
    db: AsyncSession, search: str | None = None, type_filter: str | None = None
) -> list[PokemonSummary]:
    """Backs the Pokedex browser's list/search view."""
    stmt = select(Species).order_by(Species.num, Species.id)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(Species.id.like(like), Species.name.ilike(f"%{search}%")))
    if type_filter:
        stmt = stmt.where(or_(Species.type1 == type_filter, Species.type2 == type_filter))

    result = await db.execute(stmt)
    return [
        PokemonSummary(
            id=s.id, name=s.name, num=s.num, type1=s.type1, type2=s.type2, sprite_url=s.sprite_url
        )
        for s in result.scalars().all()
    ]


async def _type_matchups_for(
    db: AsyncSession, type1: str, type2: str | None
) -> list[TypeEffectiveness]:
    type_chart = await get_type_chart(db)
    combined = compute_matchups(type1, type2, type_chart)
    return [TypeEffectiveness(type=t, multiplier=m) for t, m in combined.items()]


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

    mega_formes: list[PokemonProfile] = []
    if include_mega:
        mega_result = await db.execute(
            select(Species).where(Species.base_species == species.id, Species.forme.ilike("Mega%"))
        )
        for mega_species in mega_result.scalars().all():
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
            )
            for m in moves
        ],
        type_matchups=type_matchups,
        natures=natures,
        sprite_url=species.sprite_url,
        mega_formes=mega_formes,
    )


async def get_pokemon_profile(db: AsyncSession, species_id: str) -> PokemonProfile | None:
    result = await db.execute(select(Species).where(Species.id == species_id))
    species = result.scalar_one_or_none()
    if species is None:
        return None
    return await _build_profile(db, species, include_mega=True)
