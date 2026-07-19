"""One-time (re-runnable) seed script populating the Pokedex reference tables
(species, moves, abilities, natures, type_matchups, items) from poke-env's
bundled, Showdown-sourced Gen 9 data, plus real ability/move description text
and the entire items table fetched from PokeAPI — poke-env has no item data
at all, and its move/ability data has ids/mechanics only, no flavor text (see
app/data/pokeapi_client.py).

Usage (from Backend/):
    uv run python -m scripts.seed_pokedex
    uv run python -m scripts.seed_pokedex --refresh-descriptions  # re-fetch from PokeAPI

Idempotent: uses INSERT ... ON CONFLICT DO UPDATE, so re-running after a
poke-env data refresh (it auto-syncs from Smogon roughly monthly) updates
existing rows in place rather than erroring or duplicating.

See Docs/backend/README.md for the known limitations of poke-env's data
source and the PokeAPI-backed description pipeline.
"""

import asyncio
import sys

from poke_env.data import GenData
from poke_env.data.normalize import to_id_str
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.data.pokeapi_client import (
    get_ability_descriptions,
    get_items,
    get_move_descriptions,
    get_pokemon_descriptions,
    get_pokemon_genera,
)
from app.db.session import AsyncSessionLocal, engine
from app.models import Ability, Item, Move, Nature, Species, TypeMatchup

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


def _prevo_inherited_moves(gen_data: GenData, species_id: str) -> set[str]:
    """Every move any earlier stage in `species_id`'s own evolution line
    could learn, unioned in on top of its own learnset entry (which
    `_movepool_for` already covers, so this only walks *ancestors* —
    starting from `species_id`'s `prevo`, not `species_id` itself).

    Showdown's bundled learnset data lists an egg move only on the
    earliest stage that can actually breed for it — e.g. Sucker Punch is
    Pawniard's own entry only; Bisharp's and Kingambit's entries omit it
    entirely — even though the real games let any evolution of that line
    know it, and it's real enough to be a top-6 usage-stats move (Kingambit
    runs it on ~25% of real ladder sets — see Docs/backend/README.md's
    note on this same class of bug for items). Level-up/TM moves are
    already repeated on every stage in practice, so this mostly only ever
    adds egg moves, but unions the whole ancestor learnset rather than
    special-casing egg moves since there's no real reason a later stage
    should know less than an earlier one."""
    moves: set[str] = set()
    seen = {species_id}
    prevo_display = gen_data.pokedex.get(species_id, {}).get("prevo")
    current_id = to_id_str(prevo_display) if prevo_display else None
    while current_id and current_id not in seen:
        seen.add(current_id)
        moves |= _gen_legal_moves(gen_data.learnset.get(current_id))
        prevo_display = gen_data.pokedex.get(current_id, {}).get("prevo")
        current_id = to_id_str(prevo_display) if prevo_display else None
    return moves


def _movepool_for(
    gen_data: GenData, species_id: str, base_species_id: str, *, is_forme: bool
) -> list[str]:
    """A forme's own learnset entry, when one exists, is usually just its
    forme-exclusive move(s) (e.g. Rotom-Wash's entry is only Hydro Pump) or
    is entirely absent (Mega Evolutions have none at all) — Showdown expects
    it to be *merged* with the base species' movepool, not used instead of
    it. Some formes (e.g. Therian formes) have no learnset key at all
    (`eventOnly`), in which case this just reduces to the base's movepool.
    Non-formes simply use their own entry, unmodified. Either way, moves
    inherited from earlier stages in the evolution line (see
    `_prevo_inherited_moves`) are unioned in on top."""
    own_moves = _gen_legal_moves(gen_data.learnset.get(species_id))
    if not is_forme:
        return sorted(own_moves | _prevo_inherited_moves(gen_data, species_id))
    base_moves = _gen_legal_moves(gen_data.learnset.get(base_species_id))
    return sorted(own_moves | base_moves | _prevo_inherited_moves(gen_data, base_species_id))


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


async def seed_moves(session: AsyncSession, gen_data: GenData, descriptions: dict[str, str]) -> int:
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
            description=descriptions.get(move_id),
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
                "description": stmt.excluded.description,
            },
        )
        await session.execute(stmt)
        count += 1
    return count


async def seed_abilities(
    session: AsyncSession, gen_data: GenData, descriptions: dict[str, str]
) -> int:
    ability_ids: dict[str, str] = {}
    for species in gen_data.pokedex.values():
        for display_name in species.get("abilities", {}).values():
            ability_ids[to_id_str(display_name)] = display_name

    count = 0
    for ability_id, display_name in ability_ids.items():
        stmt = pg_insert(Ability).values(
            id=ability_id,
            name=display_name,
            description=descriptions.get(ability_id),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Ability.id],
            set_={"name": stmt.excluded.name, "description": stmt.excluded.description},
        )
        await session.execute(stmt)
        count += 1
    return count


def _is_fabricated_mega(species: dict, items: dict[str, dict]) -> bool:
    """True for a couple dozen forme rows Showdown's data bundles that
    *look* like real Mega Evolutions (a "Mega"-containing forme —
    "Mega"/"Mega-X"/"Mega-Y"/"Mega-Z", or a compound one like Meowstic's
    "F-Mega"/Tatsugiri's "Curly-Mega" — with requiredItem set) but aren't —
    e.g. Raichu-Mega-X/Y, Garchomp-Mega-Z, Absol-Mega-Z, Tatsugiri-Curly-Mega.
    These are Smogon CAP community-format additions, not part of any real
    game, and (unlike true CAP *species* with num<=0 above) can't be
    filtered by num since they inherit their real base species' positive
    dex number.

    The distinguishing signal: every genuine Mega Evolution's requiredItem
    is a real, released Mega Stone — present in PokeAPI's items with a real
    *official* sprite (PokeAPI's own flat `sprites/items/<slug>.png`, not
    the generation-versioned fallback `app/data/pokeapi_client.py` also
    checks for display purposes — that fallback's per-generation folders
    turn out to also carry community fan art for these exact non-canonical
    stones, so it can't be reused as this signal). These fabricated ones
    either use a made-up item name entirely (Meowstic's "Meowsticite" isn't
    in PokeAPI at all) or, confusingly, *are* in PokeAPI (it also catalogs
    unused/beta item data mined from the games' code) but were simply never
    released — no official sprite art exists for them, e.g. "Raichunite
    X"."""
    forme = species.get("forme")
    if not forme or "Mega" not in forme.split("-"):
        return False
    required_item = species.get("requiredItem")
    if not required_item:
        return False
    item = items.get(to_id_str(required_item))
    return not (item and item["category"] == "mega-stones" and item.get("official_sprite"))


async def seed_species(
    session: AsyncSession,
    gen_data: GenData,
    items: dict[str, dict],
    pokemon_descriptions: dict[str, str],
    pokemon_genera: dict[str, str],
) -> int:
    count = 0
    fabricated_ids = []
    for species_id, species in gen_data.pokedex.items():
        num = species.get("num", 0)
        if num <= 0:
            # Excludes CAP (Create-A-Pokemon) and other non-standard entries
            # that Showdown's data bundles for its own community formats —
            # not part of any real Pokedex. See Docs/backend/README.md.
            continue
        if _is_fabricated_mega(species, items):
            fabricated_ids.append(species_id)
            continue

        base_species_display = species.get("baseSpecies")
        base_species_id = to_id_str(base_species_display) if base_species_display else species_id
        is_forme = base_species_id != species_id

        types = species.get("types", ["Normal"])
        abilities = {slot: to_id_str(name) for slot, name in species.get("abilities", {}).items()}

        learnable_moves = _movepool_for(gen_data, species_id, base_species_id, is_forme=is_forme)

        prevo_display = species.get("prevo")
        evos_display = species.get("evos", [])

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
            description=pokemon_descriptions.get(base_species_id),
            genus=pokemon_genera.get(base_species_id),
            prevo=to_id_str(prevo_display) if prevo_display else None,
            evos=[to_id_str(name) for name in evos_display],
            evo_type=species.get("evoType"),
            evo_level=species.get("evoLevel"),
            evo_item=species.get("evoItem"),
            evo_move=species.get("evoMove"),
            evo_condition=species.get("evoCondition"),
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
                "description": stmt.excluded.description,
                "genus": stmt.excluded.genus,
                "prevo": stmt.excluded.prevo,
                "evos": stmt.excluded.evos,
                "evo_type": stmt.excluded.evo_type,
                "evo_level": stmt.excluded.evo_level,
                "evo_item": stmt.excluded.evo_item,
                "evo_move": stmt.excluded.evo_move,
                "evo_condition": stmt.excluded.evo_condition,
            },
        )
        await session.execute(stmt)
        count += 1

    if fabricated_ids:
        # A prior run of this script (before _is_fabricated_mega existed)
        # may have already inserted these — upsert alone never removes rows
        # that stop being inserted, so they need an explicit sweep.
        await session.execute(delete(Species).where(Species.id.in_(fabricated_ids)))

    return count


async def seed_items(session: AsyncSession, items: dict[str, dict]) -> int:
    count = 0
    for item_id, item in items.items():
        stmt = pg_insert(Item).values(
            id=item_id,
            name=item["name"],
            description=item.get("description"),
            category=item["category"],
            fling_power=item.get("fling_power"),
            sprite_url=item.get("sprite_url"),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Item.id],
            set_={
                "name": stmt.excluded.name,
                "description": stmt.excluded.description,
                "category": stmt.excluded.category,
                "fling_power": stmt.excluded.fling_power,
                "sprite_url": stmt.excluded.sprite_url,
            },
        )
        await session.execute(stmt)
        count += 1
    return count


async def main() -> None:
    settings = get_settings()
    print(f"Seeding Pokedex reference data (gen {GEN}) into {settings.database_url.split('@')[-1]}")

    refresh_descriptions = "--refresh-descriptions" in sys.argv
    gen_data = GenData.from_gen(GEN)

    move_descriptions = await get_move_descriptions(refresh=refresh_descriptions)
    print(f"  move descriptions:     {len(move_descriptions)} (from PokeAPI)")
    ability_descriptions = await get_ability_descriptions(refresh=refresh_descriptions)
    print(f"  ability descriptions:  {len(ability_descriptions)} (from PokeAPI)")
    items = await get_items(refresh=refresh_descriptions)
    print(f"  items:                 {len(items)} (from PokeAPI)")
    pokemon_descriptions = await get_pokemon_descriptions(refresh=refresh_descriptions)
    print(f"  pokemon descriptions:  {len(pokemon_descriptions)} (from PokeAPI)")
    # Shares the same species-meta crawl/cache as descriptions — calling this
    # after get_pokemon_descriptions is essentially free once either cache is warm.
    pokemon_genera = await get_pokemon_genera(refresh=refresh_descriptions)
    print(f"  pokemon genera:        {len(pokemon_genera)} (from PokeAPI)")

    async with AsyncSessionLocal() as session:
        natures_count = await seed_natures(session, gen_data)
        await session.commit()
        print(f"  natures:        {natures_count}")

        type_matchups_count = await seed_type_matchups(session, gen_data)
        await session.commit()
        print(f"  type_matchups:  {type_matchups_count}")

        moves_count = await seed_moves(session, gen_data, move_descriptions)
        await session.commit()
        print(f"  moves:          {moves_count}")

        abilities_count = await seed_abilities(session, gen_data, ability_descriptions)
        await session.commit()
        print(f"  abilities:      {abilities_count}")

        species_count = await seed_species(
            session, gen_data, items, pokemon_descriptions, pokemon_genera
        )
        await session.commit()
        print(f"  species:        {species_count}")

        items_count = await seed_items(session, items)
        await session.commit()
        print(f"  items:          {items_count}")

    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
