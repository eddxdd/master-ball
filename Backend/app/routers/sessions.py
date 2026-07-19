"""Phase 3's Mental-Game Coach endpoints — battle-result logging, tilt
detection + push nudges, and the post-loss explanation flow. See
Docs/roadmap.md's Phase 3 section and Docs/backend/README.md's "Mental-Game
Coach (Phase 3)" section.
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import AgentUnavailableError, run_agent
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.chat import ChatResponse
from app.schemas.session import (
    BattleLogEntryOut,
    LogBattleResultRequest,
    LogBattleResultResponse,
    PostLossReviewRequest,
    PushSubscribeRequest,
    VapidPublicKeyResponse,
)
from app.tools.battle_log import (
    build_post_loss_prompt,
    check_tilt_risk,
    get_battle_log_entry,
    list_battle_log,
    log_battle_result,
    maybe_send_tilt_nudge,
)
from app.tools.push import delete_push_subscription, upsert_push_subscription

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/battle-log", response_model=LogBattleResultResponse)
async def post_battle_log(
    request: LogBattleResultRequest, db: AsyncSession = Depends(get_db)
) -> LogBattleResultResponse:
    entry = await log_battle_result(db, request.client_id, request.result, request.note)
    tilt_check = await check_tilt_risk(db, request.client_id)
    push_sent = await maybe_send_tilt_nudge(db, request.client_id, tilt_check)
    return LogBattleResultResponse(
        entry=BattleLogEntryOut.model_validate(entry, from_attributes=True),
        tilt_check=tilt_check,
        push_sent=push_sent,
    )


@router.get("/battle-log", response_model=list[BattleLogEntryOut])
async def get_battle_log_route(
    client_id: str, db: AsyncSession = Depends(get_db)
) -> list[BattleLogEntryOut]:
    entries = await list_battle_log(db, client_id)
    return [BattleLogEntryOut.model_validate(e, from_attributes=True) for e in entries]


@router.get("/push/vapid-public-key", response_model=VapidPublicKeyResponse)
async def get_vapid_public_key() -> VapidPublicKeyResponse:
    settings = get_settings()
    return VapidPublicKeyResponse(public_key=settings.vapid_public_key)


@router.post("/push/subscribe", status_code=204, response_class=Response)
async def post_push_subscribe(
    request: PushSubscribeRequest, db: AsyncSession = Depends(get_db)
) -> Response:
    await upsert_push_subscription(db, request)
    return Response(status_code=204)


@router.delete("/push/subscribe/{client_id}", status_code=204, response_class=Response)
async def delete_push_subscribe(client_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    await delete_push_subscription(db, client_id)
    return Response(status_code=204)


@router.post("/post-loss-review", response_model=ChatResponse)
async def post_loss_review(
    request: PostLossReviewRequest, db: AsyncSession = Depends(get_db)
) -> ChatResponse:
    note = request.note
    if request.battle_log_entry_id is not None:
        entry = await get_battle_log_entry(db, request.battle_log_entry_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="Unknown battle log entry.")
        note = entry.note

    prompt = build_post_loss_prompt(note)
    try:
        result = await run_agent(db, prompt)
    except AgentUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ChatResponse(**result)
