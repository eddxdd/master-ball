from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import Species
from app.schemas.team import Team, TeamAnalysis, TeamImportRequest, TeamImportResponse
from app.tools.team_analysis import analyze_team as analyze_team_tool
from app.tools.team_import import parse_showdown_team

router = APIRouter(prefix="/team", tags=["team"])


@router.post("/import", response_model=TeamImportResponse)
async def import_team(
    request: TeamImportRequest, db: AsyncSession = Depends(get_db)
) -> TeamImportResponse:
    team = parse_showdown_team(request.text)

    warnings: list[str] = []
    if team.members:
        result = await db.execute(
            select(Species.id).where(Species.id.in_([m.species_id for m in team.members]))
        )
        known_ids = set(result.scalars().all())
        for member in team.members:
            label = member.nickname or member.species_id
            if member.species_id not in known_ids:
                warnings.append(f"Couldn't recognize species '{label}' — check the spelling.")
    else:
        warnings.append("No Pokemon found in that import text.")

    return TeamImportResponse(team=team, warnings=warnings)


@router.post("/analyze", response_model=TeamAnalysis)
async def analyze_team(team: Team, db: AsyncSession = Depends(get_db)) -> TeamAnalysis:
    return await analyze_team_tool(db, team)
