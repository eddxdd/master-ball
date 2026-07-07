"""calculate_damage — the damage calculator tool.

Deterministic, no LLM (see Docs/architecture.md). Implements the core Gen 9
singles damage formula plus a curated set of common competitive modifiers —
see Docs/backend/damage-calc.md for exactly what's in scope vs. deferred, and
tests/test_damage_calc.py for the known-correct values this is checked
against.
"""

from poke_env.data.normalize import to_id_str
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.calc_modifiers import (
    ADAPTABILITY_ABILITY,
    CHOICE_ITEMS,
    GUTS_ABILITY,
    HUGE_POWER_ABILITIES,
    LIFE_ORB_ID,
    LIFE_ORB_MULTIPLIER,
    TECHNICIAN_ABILITY,
    TECHNICIAN_THRESHOLD,
)
from app.models import Move, Nature, Species, TypeMatchup
from app.schemas.calculator import DamageCalcRequest, DamageCalcResult, PokemonBattleState
from app.tools.stats import apply_stat_stage, calculate_stat

STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")


class DamageCalcError(ValueError):
    """Raised for calculator-specific input problems (e.g. a Status move) —
    distinct from a plain 404 (species/move not found), which the router
    handles separately."""


async def _get_species(db: AsyncSession, species_id: str) -> Species | None:
    result = await db.execute(select(Species).where(Species.id == species_id))
    return result.scalar_one_or_none()


async def _get_move(db: AsyncSession, move_id: str) -> Move | None:
    result = await db.execute(select(Move).where(Move.id == move_id))
    return result.scalar_one_or_none()


async def _get_natures(db: AsyncSession) -> dict[str, Nature]:
    result = await db.execute(select(Nature))
    return {n.id: n for n in result.scalars().all()}


async def _get_type_chart(db: AsyncSession) -> dict[tuple[str, str], float]:
    result = await db.execute(select(TypeMatchup))
    return {
        (row.attacking_type, row.defending_type): row.multiplier for row in result.scalars().all()
    }


def _nature_multiplier(nature: Nature | None, stat_key: str) -> float:
    if nature is None:
        return 1.0
    if nature.increased_stat == stat_key:
        return 1.1
    if nature.decreased_stat == stat_key:
        return 0.9
    return 1.0


def _compute_stat(
    species: Species, stat_key: str, state: PokemonBattleState, nature: Nature | None
) -> int:
    base = species.base_stats[stat_key]
    iv = state.ivs.get(stat_key, 31)
    ev = state.evs.get(stat_key, 0)
    if stat_key == "hp":
        return calculate_stat(base, iv, ev, state.level, is_hp=True)
    return calculate_stat(
        base,
        iv,
        ev,
        state.level,
        is_hp=False,
        nature_multiplier=_nature_multiplier(nature, stat_key),
    )


def _species_types(species: Species) -> list[str]:
    return [species.type1] + ([species.type2] if species.type2 else [])


def _stab_multiplier(
    move_type: str, original_types: list[str], tera_type: str | None, has_adaptability: bool
) -> float:
    base = 2.0 if has_adaptability else 1.5
    applicable_types = set(original_types)
    if tera_type:
        applicable_types.add(tera_type)
    return base if move_type in applicable_types else 1.0


def _type_effectiveness(
    move_type: str, defending_types: list[str], type_chart: dict[tuple[str, str], float]
) -> float:
    multiplier = 1.0
    for defending_type in defending_types:
        multiplier *= type_chart.get((move_type, defending_type), 1.0)
    return multiplier


def _describe_ko(ko_count: int, total: int) -> str:
    if ko_count == 0:
        return "No KO"
    if ko_count == total:
        return "Guaranteed KO"
    return f"{ko_count}/{total} chance to KO"


async def calculate_damage(db: AsyncSession, request: DamageCalcRequest) -> DamageCalcResult | None:
    """Returns None if the species or move isn't found (404 territory);
    raises DamageCalcError for a valid-but-inapplicable request (e.g. a
    Status move, which has no damage to calculate)."""
    attacker_species = await _get_species(db, request.attacker.species_id)
    defender_species = await _get_species(db, request.defender.species_id)
    move = await _get_move(db, request.move_id)
    if attacker_species is None or defender_species is None or move is None:
        return None

    if move.category == "Status" or move.base_power is None:
        raise DamageCalcError(f"{move.name} is a Status move — no damage to calculate.")

    natures = await _get_natures(db)
    type_chart = await _get_type_chart(db)

    attacker_ability = (
        to_id_str(request.attacker.ability)
        if request.attacker.ability
        else (attacker_species.abilities.get("0", ""))
    )
    attacker_item = to_id_str(request.attacker.item) if request.attacker.item else None

    is_physical = move.category == "Physical"
    attack_key = "atk" if is_physical else "spa"
    defense_key = "def" if is_physical else "spd"

    attacker_nature = natures.get(request.attacker.nature)
    defender_nature = natures.get(request.defender.nature)

    attack_stat = float(
        _compute_stat(attacker_species, attack_key, request.attacker, attacker_nature)
    )
    defense_stat = float(
        _compute_stat(defender_species, defense_key, request.defender, defender_nature)
    )

    attacker_stage = request.attacker.stat_stages.get(attack_key, 0)
    defender_stage = request.defender.stat_stages.get(defense_key, 0)
    if request.field.is_critical:
        # A critical hit ignores the attacker's negative stage and the
        # defender's positive stage on the relevant stat — official rule,
        # not an approximation.
        attacker_stage = max(attacker_stage, 0)
        defender_stage = min(defender_stage, 0)

    attack_stat = apply_stat_stage(attack_stat, attacker_stage)
    defense_stat = apply_stat_stage(defense_stat, defender_stage)

    if attacker_ability in HUGE_POWER_ABILITIES:
        attack_stat *= 2
    has_guts_bonus = attacker_ability == GUTS_ABILITY and request.attacker.status is not None
    if has_guts_bonus:
        attack_stat *= 1.5

    if attacker_item in CHOICE_ITEMS:
        item_stat, item_mult = CHOICE_ITEMS[attacker_item]
        if item_stat == attack_key:
            attack_stat *= item_mult

    attack = max(1, int(attack_stat))
    defense = max(1, int(defense_stat))

    base_power = move.base_power
    if attacker_ability == TECHNICIAN_ABILITY and base_power <= TECHNICIAN_THRESHOLD:
        base_power = int(base_power * 1.5)

    level = request.attacker.level
    base_damage = (2 * level // 5 + 2) * base_power * attack // defense // 50 + 2

    modifiers = 1.0
    if request.field.spread_move:
        modifiers *= 0.75

    if request.field.weather == "sun":
        modifiers *= 1.5 if move.type == "Fire" else (0.5 if move.type == "Water" else 1.0)
    elif request.field.weather == "rain":
        modifiers *= 1.5 if move.type == "Water" else (0.5 if move.type == "Fire" else 1.0)

    if request.field.is_critical:
        modifiers *= 1.5

    attacker_types = _species_types(attacker_species)
    stab = _stab_multiplier(
        move.type,
        attacker_types,
        request.attacker.tera_type,
        attacker_ability == ADAPTABILITY_ABILITY,
    )
    modifiers *= stab

    defending_types = (
        [request.defender.tera_type]
        if request.defender.tera_type
        else _species_types(defender_species)
    )
    effectiveness = _type_effectiveness(move.type, defending_types, type_chart)
    modifiers *= effectiveness
    is_immune = effectiveness == 0

    if is_physical and request.attacker.status == "brn" and not has_guts_bonus:
        modifiers *= 0.5

    screen_active = request.field.aurora_veil or (
        (is_physical and request.field.reflect) or (not is_physical and request.field.light_screen)
    )
    if screen_active and not request.field.is_critical:
        modifiers *= 0.5

    if attacker_item == LIFE_ORB_ID:
        modifiers *= LIFE_ORB_MULTIPLIER

    if is_immune or base_power == 0:
        rolls = [0] * 16
    else:
        rolls = [
            max(1, int(base_damage * modifiers * roll_pct / 100)) for roll_pct in range(85, 101)
        ]

    defender_max_hp = _compute_stat(defender_species, "hp", request.defender, defender_nature)
    defender_current_hp = max(1, int(defender_max_hp * request.defender.current_hp_percent / 100))
    ko_count = sum(1 for r in rolls if r >= defender_current_hp)

    return DamageCalcResult(
        move_name=move.name,
        move_type=move.type,
        category=move.category,
        is_immune=is_immune,
        type_effectiveness=effectiveness,
        stab_multiplier=stab,
        rolls=rolls,
        min_damage=min(rolls),
        max_damage=max(rolls),
        min_percent=round(min(rolls) / defender_max_hp * 100, 1),
        max_percent=round(max(rolls) / defender_max_hp * 100, 1),
        defender_max_hp=defender_max_hp,
        ko_chance_description=_describe_ko(ko_count, len(rolls)),
    )
