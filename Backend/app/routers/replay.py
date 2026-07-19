"""Phase 5's Showdown replay endpoints — parse a replay into structured turns,
or get an AI postmortem of one. See app/tools/replay_parser.py and
app/tools/replay_coach.py.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import AgentUnavailableError, run_agent
from app.db.session import get_db
from app.schemas.chat import ChatResponse
from app.schemas.replay import ParsedReplay, ReplayCoachRequest, ReplayParseRequest
from app.tools.replay_coach import build_replay_coach_prompt
from app.tools.replay_parser import fetch_replay, parse_replay_log

router = APIRouter(prefix="/replay", tags=["replay"])


async def _resolve_log(log: str | None, replay_id: str | None) -> str:
    if log and replay_id:
        raise HTTPException(
            status_code=400, detail="Provide either 'log' or 'replay_id', not both."
        )
    if log:
        return log
    if replay_id:
        try:
            return await fetch_replay(replay_id)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=404, detail=f"Couldn't find replay '{replay_id}' — check the id/URL."
            ) from exc
    raise HTTPException(status_code=400, detail="Provide either 'log' or 'replay_id'.")


@router.post("/parse", response_model=ParsedReplay)
async def parse_replay(request: ReplayParseRequest) -> ParsedReplay:
    log = await _resolve_log(request.log, request.replay_id)
    return parse_replay_log(log)


@router.post("/coach", response_model=ChatResponse)
async def replay_coach(
    request: ReplayCoachRequest, db: AsyncSession = Depends(get_db)
) -> ChatResponse:
    log = await _resolve_log(request.log, request.replay_id)
    parsed = parse_replay_log(log)
    prompt = build_replay_coach_prompt(parsed)
    try:
        result = await run_agent(db, prompt)
    except AgentUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ChatResponse(**result)
