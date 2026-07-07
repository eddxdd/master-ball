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
        speed_tiers.append(
            SpeedTierEntry(
                species_id=species.id, name=species.name, nickname=member.nickname, speed=speed
            )
        )
    speed_tiers.sort(key=lambda entry: entry.speed, reverse=True)

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
    )
