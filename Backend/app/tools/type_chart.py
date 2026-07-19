"""Shared type-chart helpers — used by get_pokemon_profile (single-species
matchups) and analyze_team (team-wide weakness matrix/type coverage), so the
effectiveness math is computed in exactly one place."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TypeMatchup

ALL_TYPES = [
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison",
    "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark",
    "Steel", "Fairy",
]  # fmt: skip


async def get_type_chart(db: AsyncSession) -> dict[tuple[str, str], float]:
    result = await db.execute(select(TypeMatchup))
    return {
        (row.attacking_type, row.defending_type): row.multiplier for row in result.scalars().all()
    }


def compute_matchups(
    type1: str, type2: str | None, type_chart: dict[tuple[str, str], float]
) -> dict[str, float]:
    """The combined attacking-type -> multiplier map for a (possibly dual)
    defending type combination."""
    defending_types = [type1] if type2 is None else [type1, type2]
    combined: dict[str, float] = dict.fromkeys(ALL_TYPES, 1.0)
    for attacking_type in ALL_TYPES:
        for defending_type in defending_types:
            combined[attacking_type] *= type_chart.get((attacking_type, defending_type), 1.0)
    return combined


def compute_attacking_matchups(
    attacking_type: str, type_chart: dict[tuple[str, str], float]
) -> dict[str, float]:
    """The mirror of compute_matchups: how effective a single `attacking_type`
    is against each single defending type — used by get_type_detail's "moves
    of this type" side of the chart (compute_matchups already covers the
    "moves against this type" side, called with a single defending type)."""
    return {
        defending_type: type_chart.get((attacking_type, defending_type), 1.0)
        for defending_type in ALL_TYPES
    }
