"""analyze_team — type coverage, speed tiers, weakness matrix, and simple
heuristic role-compression flags. Deterministic + rule-based, no LLM (see
Docs/architecture.md); the agent's job later is to explain this output in
natural language, not to compute or approximate it.

Members with an unresolvable species_id are silently skipped in the
computed results (lenient, matches the team-import scope note) rather than
failing the whole analysis over one bad row.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Nature, Species
from app.schemas.team import (
    MemberRoleEntry,
    PokemonSet,
    RoleFlag,
    SpeedTierEntry,
    Team,
    TeamAnalysis,
    TypeCoverageEntry,
    WeaknessMatrixEntry,
)
from app.tools.stats import calculate_stat
from app.tools.type_chart import ALL_TYPES, compute_matchups, get_type_chart

STRONG_ATTACKING_STAT_THRESHOLD = 90
SHARED_WEAKNESS_THRESHOLD = 3
FAST_BASE_SPE_THRESHOLD = 90
BULKY_BST_THRESHOLD = 240


async def _get_species_map(db: AsyncSession, species_ids: list[str]) -> dict[str, Species]:
    result = await db.execute(select(Species).where(Species.id.in_(species_ids)))
    return {s.id: s for s in result.scalars().all()}


async def _get_natures_map(db: AsyncSession) -> dict[str, Nature]:
    result = await db.execute(select(Nature))
    return {n.id: n for n in result.scalars().all()}


def _nature_multiplier(nature: Nature | None, stat_key: str) -> float:
    if nature is None:
        return 1.0
    if nature.increased_stat == stat_key:
        return 1.1
    if nature.decreased_stat == stat_key:
        return 0.9
    return 1.0


def _infer_member_role(member: PokemonSet, species: Species, speed: int) -> tuple[str, str]:
    """Heuristic role label + one-line blurb from base stats, EV investment,
    and held item. Intentionally coarse — good enough to orient a builder,
    not a substitute for reading the set."""
    stats = species.base_stats
    atk, spa = stats["atk"], stats["spa"]
    hp, defense, spd, spe = stats["hp"], stats["def"], stats["spd"], stats["spe"]
    bulk = hp + defense + spd
    physical = atk >= spa
    offense = atk if physical else spa
    side = "Physical" if physical else "Special"

    atk_ev = member.evs.get("atk", 0)
    spa_ev = member.evs.get("spa", 0)
    hp_ev = member.evs.get("hp", 0)
    def_ev = member.evs.get("def", 0)
    spd_ev = member.evs.get("spd", 0)
    spe_ev = member.evs.get("spe", 0)
    # EV investment can flip physical vs special when bases are close.
    if spa_ev > atk_ev + 50:
        physical = False
        side = "Special"
        offense = spa
    elif atk_ev > spa_ev + 50:
        physical = True
        side = "Physical"
        offense = atk

    item = (member.item or "").strip()
    item_l = item.lower()
    ability = (member.ability or "").strip()
    types = "/".join(t for t in (species.type1, species.type2) if t)
    extras: list[str] = []
    if item:
        extras.append(f"holds {item}")
    if ability:
        extras.append(ability)
    extras.append(f"{speed} Spe")
    trailer = "; ".join(extras)

    if "choice scarf" in item_l:
        return (
            f"{side} revenge killer",
            f"{species.name} ({types}) is a Choice Scarf {side.lower()} attacker — "
            f"outspeeds threats after a KO or to revenge kill. {trailer}.",
        )
    if "choice band" in item_l:
        return (
            "Physical wallbreaker",
            f"{species.name} ({types}) is locked into a Choice Band set for raw "
            f"physical damage. {trailer}.",
        )
    if "choice specs" in item_l:
        return (
            "Special wallbreaker",
            f"{species.name} ({types}) is locked into Choice Specs for raw "
            f"special damage. {trailer}.",
        )
    if "assault vest" in item_l:
        return (
            f"Bulky {side.lower()} attacker",
            f"{species.name} ({types}) runs Assault Vest — specially bulky and "
            f"still hitting hard on the {side.lower()} side. {trailer}.",
        )
    defensive_item = any(
        k in item_l for k in ("rocky helmet", "leftovers", "heavy-duty boots", "boots")
    )
    if defensive_item and (bulk >= BULKY_BST_THRESHOLD or hp_ev + def_ev + spd_ev >= 252):
        if defense >= spd + 15 or def_ev > spd_ev + 50:
            role = "Physical wall"
        elif spd >= defense + 15 or spd_ev > def_ev + 50:
            role = "Special wall"
        else:
            role = "Mixed wall"
        return (
            role,
            f"{species.name} ({types}) is built as a {role.lower()} with "
            f"{item or 'a defensive item'}. {trailer}.",
        )

    is_fast = spe >= FAST_BASE_SPE_THRESHOLD or spe_ev >= 252 or speed >= 300
    is_bulky = bulk >= BULKY_BST_THRESHOLD or hp_ev + def_ev + spd_ev >= 252
    is_offensive = offense >= STRONG_ATTACKING_STAT_THRESHOLD or atk_ev >= 252 or spa_ev >= 252

    if is_bulky and not is_offensive:
        if defense >= spd + 15:
            role = "Physical wall"
        elif spd >= defense + 15:
            role = "Special wall"
        else:
            role = "Mixed wall"
        return (
            role,
            f"{species.name} ({types}) soaks hits as a {role.lower()} "
            f"({hp}/{defense}/{spd} bulk). {trailer}.",
        )

    if is_fast and is_offensive:
        return (
            f"{side} sweeper",
            f"{species.name} ({types}) is a fast {side.lower()} sweeper — "
            f"pressure from speed control and {offense} base "
            f"{'Attack' if physical else 'Sp. Atk'}. {trailer}.",
        )

    if is_bulky and is_offensive:
        return (
            f"Bulky {side.lower()} attacker",
            f"{species.name} ({types}) hits hard while staying bulky — a "
            f"{side.lower()} tank/attacker hybrid. {trailer}.",
        )

    if is_offensive:
        return (
            f"{side} attacker",
            f"{species.name} ({types}) covers the {side.lower()} attacking role "
            f"for the team. {trailer}.",
        )

    if is_fast:
        return (
            "Speed control / pivot",
            f"{species.name} ({types}) brings speed ({speed} Spe) and likely "
            f"momentum or utility rather than raw power. {trailer}.",
        )

    return (
        "Support / utility",
        f"{species.name} ({types}) looks like a support or utility piece — "
        f"hazards, status, or team support over raw stats. {trailer}.",
    )


async def analyze_team(db: AsyncSession, team: Team) -> TeamAnalysis:
    species_ids = [m.species_id for m in team.members]
    species_map = await _get_species_map(db, species_ids)
    natures_map = await _get_natures_map(db)
    type_chart = await get_type_chart(db)

    valid_members = [
        (member, species_map[member.species_id])
        for member in team.members
        if member.species_id in species_map
    ]

    speed_tiers = []
    member_speeds: list[tuple[PokemonSet, Species, int]] = []
    for member, species in valid_members:
        nature = natures_map.get(member.nature)
        speed = calculate_stat(
            species.base_stats["spe"],
            member.ivs.get("spe", 31),
            member.evs.get("spe", 0),
            member.level,
            is_hp=False,
            nature_multiplier=_nature_multiplier(nature, "spe"),
        )
        member_speeds.append((member, species, speed))
        speed_tiers.append(
            SpeedTierEntry(
                species_id=species.id, name=species.name, nickname=member.nickname, speed=speed
            )
        )
    speed_tiers.sort(key=lambda entry: entry.speed, reverse=True)

    member_roles: list[MemberRoleEntry] = []
    for member, species, speed in member_speeds:
        role, summary = _infer_member_role(member, species, speed)
        member_roles.append(
            MemberRoleEntry(
                species_id=species.id,
                name=species.name,
                nickname=member.nickname,
                sprite_url=species.sprite_url,
                type1=species.type1,
                type2=species.type2,
                role=role,
                summary=summary,
                item=member.item,
                ability=member.ability,
                speed=speed,
            )
        )

    weakness_matrix = []
    weak_counts = dict.fromkeys(ALL_TYPES, 0)
    resist_counts = dict.fromkeys(ALL_TYPES, 0)
    immune_counts = dict.fromkeys(ALL_TYPES, 0)
    for member, species in valid_members:
        matchups = compute_matchups(species.type1, species.type2, type_chart)
        weakness_matrix.append(
            WeaknessMatrixEntry(
                species_id=species.id,
                name=species.name,
                nickname=member.nickname,
                matchups=matchups,
            )
        )
        for move_type, multiplier in matchups.items():
            if multiplier == 0:
                immune_counts[move_type] += 1
            elif multiplier >= 2:
                weak_counts[move_type] += 1
            elif multiplier < 1:
                resist_counts[move_type] += 1

    type_coverage = [
        TypeCoverageEntry(
            type=t,
            weak_count=weak_counts[t],
            resist_count=resist_counts[t],
            immune_count=immune_counts[t],
        )
        for t in ALL_TYPES
    ]

    role_flags: list[RoleFlag] = []
    team_size = len(valid_members)
    if team_size > 0:
        for move_type in ALL_TYPES:
            if weak_counts[move_type] >= SHARED_WEAKNESS_THRESHOLD:
                role_flags.append(
                    RoleFlag(
                        flag=f"shared_weakness_{move_type.lower()}",
                        description=(
                            f"{weak_counts[move_type]} of {team_size} team members are weak to "
                            f"{move_type}."
                        ),
                    )
                )

        has_special_attacker = any(
            species.base_stats["spa"] >= STRONG_ATTACKING_STAT_THRESHOLD
            for _, species in valid_members
        )
        has_physical_attacker = any(
            species.base_stats["atk"] >= STRONG_ATTACKING_STAT_THRESHOLD
            for _, species in valid_members
        )
        if not has_special_attacker:
            role_flags.append(
                RoleFlag(
                    flag="no_special_attacker",
                    description="No team member has a strong (90+ base) Special Attack stat.",
                )
            )
        if not has_physical_attacker:
            role_flags.append(
                RoleFlag(
                    flag="no_physical_attacker",
                    description="No team member has a strong (90+ base) Attack stat.",
                )
            )

    return TeamAnalysis(
        type_coverage=type_coverage,
        speed_tiers=speed_tiers,
        weakness_matrix=weakness_matrix,
        role_flags=role_flags,
        member_roles=member_roles,
    )
