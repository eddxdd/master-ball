from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import MissingProviderKeyError
from app.db.session import get_db
from app.graph.session import GraphUnavailableError
from app.models import Species
from app.schemas.graph import TeamSuggestionResult
from app.schemas.team import Team, TeamAnalysis, TeamImportRequest, TeamImportResponse
from app.tools.graph_query import suggest_teammates as suggest_teammates_tool
from app.tools.team_analysis import analyze_team as analyze_team_tool
from app.tools.team_import import parse_showdown_team
from app.tools.vision_import import extract_team_from_image

router = APIRouter(prefix="/team", tags=["team"])


class TeamSuggestionRequest(BaseModel):
    species_ids: list[str]


async def _build_import_response(text: str, db: AsyncSession) -> TeamImportResponse:
    team = parse_showdown_team(text)

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


@router.post("/import", response_model=TeamImportResponse)
async def import_team(
    request: TeamImportRequest, db: AsyncSession = Depends(get_db)
) -> TeamImportResponse:
    return await _build_import_response(request.text, db)


@router.post("/import-image", response_model=TeamImportResponse)
async def import_team_from_image(
    file: UploadFile, db: AsyncSession = Depends(get_db)
) -> TeamImportResponse:
    """Screenshot-to-team import (Phase 5) — see app/tools/vision_import.py.
    Best-effort: a misread Pokemon/move surfaces as a normal "couldn't
    recognize" warning from the same validation path a pasted-text import
    goes through, not a silent wrong team."""
    image_bytes = await file.read()
    try:
        extracted_text = await extract_team_from_image(
            image_bytes, file.content_type or "image/png"
        )
    except MissingProviderKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return await _build_import_response(extracted_text, db)


@router.post("/analyze", response_model=TeamAnalysis)
async def analyze_team(team: Team, db: AsyncSession = Depends(get_db)) -> TeamAnalysis:
    return await analyze_team_tool(db, team)


@router.post("/suggest-teammates", response_model=TeamSuggestionResult)
async def suggest_teammates(request: TeamSuggestionRequest) -> TeamSuggestionResult:
    """Phase 6's AI-assisted Team Builder pick — a GraphRAG traversal (see
    app/tools/graph_query.py), not an LLM call, so this is fast/free to call
    on every Team Builder edit; the chat agent's own `suggest_teammates` tool
    binding is what adds LLM-reasoned prose on top when asked in chat."""
    try:
        return await suggest_teammates_tool(request.species_ids)
    except GraphUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
