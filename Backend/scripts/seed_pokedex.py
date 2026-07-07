"""One-time (re-runnable) seed script populating the Pokedex reference tables
(species, moves, abilities, natures, type_matchups) from poke-env's bundled,
Showdown-sourced Gen 9 data.

Usage (from Backend/):
    uv run python -m scripts.seed_pokedex

Idempotent: uses INSERT ... ON CONFLICT DO UPDATE, so re-running after a
poke-env data refresh (it auto-syncs from Smogon roughly monthly) updates
existing rows in place rather than erroring or duplicating.

See Docs/backend/README.md and Docs/backend/damage-calc.md for the known
limitations this data source has (no ability/move description text).
"""

import asyncio

from poke_env.data import GenData
from poke_env.data.normalize import to_id_str
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.data.ability_descriptions import ABILITY_DESCRIPTIONS
from app.db.session import AsyncSessionLocal, engine
from app.models import Ability, Move, Nature, Species, TypeMatchup

GEN = 9


def _normalize_type(raw_type: str) -> str:
    """poke-env's type chart keys are upper-cased ("FIRE"); species/move data
    uses title case ("Fire"). Normalize everything to title case."""
    return raw_type.capitalize()


def _sprite_url(species_id: str) -> str:
    """Showdown's public sprite CDN — the same one most fan tools (including
    ChampTeams, per product-research.md) build on. No asset hosting of our own
    needed; a handful of very new/obscure formes may 404, which the frontend
    handles gracefully (alt text), not worth pre-validating every id for v1."""
    return f"https://play.pokemonshowdown.com/sprites/dex/{species_id}.png"


def _gen_legal_moves(learnset_entry: dict | None) -> set[str]:
    if not learnset_entry:
        return set()
    moves = learnset_entry.get("learnset", {})
    return {
        move_id
        for move_id, codes in moves.items()
        if any(code.startswith(str(GEN)) for code in codes)
    }


def _movepool_for(
    gen_data: GenData, species_id: str, base_species_id: str, *, is_forme: bool
) -> list[str]:
    """A forme's own learnset entry, when one exists, is usually just its
    forme-exclusive move(s) (e.g. Rotom-Wash's entry is only Hydro Pump) or
    is entirely absent (Mega Evolutions have none at all) — Showdown expects
    it to be *merged* with the base species' movepool, not used instead of
    it. Some formes (e.g. Therian formes) have no learnset key at all
    (`eventOnly`), in which case this just reduces to the base's movepool.
    Non-formes simply use their own entry, unmodified."""
    own_moves = _gen_legal_moves(gen_data.learnset.get(species_id))
    if not is_forme:
        return sorted(own_moves)
    base_moves = _gen_legal_moves(gen_data.learnset.get(base_species_id))
    return sorted(own_moves | base_moves)


async def seed_natures(session: AsyncSession, gen_data: GenData) -> int:
    count = 0
    for nature_id, stats in gen_data.natures.items():
        increased = next(
            (s for s in ("atk", "def", "spa", "spd", "spe") if stats.get(s, 1) > 1), None
        )
        decreased = next(
            (s for s in ("atk", "def", "spa", "spd", "spe") if stats.get(s, 1) < 1), None
        )
        stmt = pg_insert(Nature).values(
            id=nature_id,
            name=nature_id.capitalize(),
            increased_stat=increased,
            decreased_stat=decreased,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Nature.id],
            set_={
                "name": stmt.excluded.name,
                "increased_stat": stmt.excluded.increased_stat,
                "decreased_stat": stmt.excluded.decreased_stat,
            },
        )
        await session.execute(stmt)
        count += 1
    return count


async def seed_type_matchups(session: AsyncSession, gen_data: GenData) -> int:
    count = 0
    for defending_type, attacking_multipliers in gen_data.type_chart.items():
        for attacking_type, multiplier in attacking_multipliers.items():
            stmt = pg_insert(TypeMatchup).values(
                attacking_type=_normalize_type(attacking_type),
                defending_type=_normalize_type(defending_type),
                multiplier=float(multiplier),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[TypeMatchup.attacking_type, TypeMatchup.defending_type],
                set_={"multiplier": stmt.excluded.multiplier},
            )
            await session.execute(stmt)
            count += 1
    return count


async def seed_moves(session: AsyncSession, gen_data: GenData) -> int:
    count = 0
    for move_id, move in gen_data.moves.items():
        accuracy = move.get("accuracy")
        accuracy = None if accuracy is True else accuracy
        stmt = pg_insert(Move).values(
            id=move_id,
            name=move["name"],
            type=_normalize_type(move["type"]),
            category=move["category"],
            base_power=move.get("basePower") or None,
            accuracy=accuracy,
            pp=move.get("pp", 0),
            priority=move.get("priority", 0),
            target=move.get("target", "normal"),
            flags=move.get("flags", {}),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Move.id],
            set_={
                "name": stmt.excluded.name,
                "type": stmt.excluded.type,
                "category": stmt.excluded.category,
                "base_power": stmt.excluded.base_power,
                "accuracy": stmt.excluded.accuracy,
                "pp": stmt.excluded.pp,
                "priority": stmt.excluded.priority,
                "target": stmt.excluded.target,
                "flags": stmt.excluded.flags,
            },
        )
        await session.execute(stmt)
        count += 1
    return count


async def seed_abilities(session: AsyncSession, gen_data: GenData) -> int:
    ability_ids: dict[str, str] = {}
    for species in gen_data.pokedex.values():
        for display_name in species.get("abilities", {}).values():
            ability_ids[to_id_str(display_name)] = display_name

    count = 0
    for ability_id, display_name in ability_ids.items():
        stmt = pg_insert(Ability).values(
            id=ability_id,
            name=display_name,
            description=ABILITY_DESCRIPTIONS.get(ability_id),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Ability.id],
            set_={"name": stmt.excluded.name, "description": stmt.excluded.description},
        )
        await session.execute(stmt)
        count += 1
    return count


async def seed_species(session: AsyncSession, gen_data: GenData) -> int:
    count = 0
    for species_id, species in gen_data.pokedex.items():
        num = species.get("num", 0)
        if num <= 0:
            # Excludes CAP (Create-A-Pokemon) and other non-standard entries
            # that Showdown's data bundles for its own community formats —
            # not part of any real Pokedex. See Docs/backend/README.md.
            continue

        base_species_display = species.get("baseSpecies")
        base_species_id = to_id_str(base_species_display) if base_species_display else species_id
        is_forme = base_species_id != species_id

        types = species.get("types", ["Normal"])
        abilities = {slot: to_id_str(name) for slot, name in species.get("abilities", {}).items()}

        learnable_moves = _movepool_for(gen_data, species_id, base_species_id, is_forme=is_forme)

        stmt = pg_insert(Species).values(
            id=species_id,
            num=num,
            name=species["name"],
            base_species=base_species_id if is_forme else None,
            forme=species.get("forme"),
            type1=types[0],
            type2=types[1] if len(types) > 1 else None,
            base_stats=species.get("baseStats", {}),
            abilities=abilities,
            learnable_moves=learnable_moves,
            sprite_url=_sprite_url(species_id),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Species.id],
            set_={
                "num": stmt.excluded.num,
                "name": stmt.excluded.name,
                "base_species": stmt.excluded.base_species,
                "forme": stmt.excluded.forme,
                "type1": stmt.excluded.type1,
                "type2": stmt.excluded.type2,
                "base_stats": stmt.excluded.base_stats,
                "abilities": stmt.excluded.abilities,
                "learnable_moves": stmt.excluded.learnable_moves,
                "sprite_url": stmt.excluded.sprite_url,
            },
        )
        await session.execute(stmt)
        count += 1
    return count


async def main() -> None:
    settings = get_settings()
    print(f"Seeding Pokedex reference data (gen {GEN}) into {settings.database_url.split('@')[-1]}")

    gen_data = GenData.from_gen(GEN)

    async with AsyncSessionLocal() as session:
        natures_count = await seed_natures(session, gen_data)
        await session.commit()
        print(f"  natures:        {natures_count}")

        type_matchups_count = await seed_type_matchups(session, gen_data)
        await session.commit()
        print(f"  type_matchups:  {type_matchups_count}")

        moves_count = await seed_moves(session, gen_data)
        await session.commit()
        print(f"  moves:          {moves_count}")

        abilities_count = await seed_abilities(session, gen_data)
        await session.commit()
        print(f"  abilities:      {abilities_count}")

        species_count = await seed_species(session, gen_data)
        await session.commit()
        print(f"  species:        {species_count}")

    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
