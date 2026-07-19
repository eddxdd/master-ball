"""Conversational endpoints — see app/agent/graph.py and Docs/ai-agents-and-rag.md."""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import AgentUnavailableError, run_agent, stream_agent
from app.db.session import get_db
from app.models.feedback import ChatFeedback
from app.schemas.chat import (
    ChatFeedbackRequest,
    ChatFeedbackResponse,
    ChatRequest,
    ChatResponse,
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)) -> ChatResponse:
    history = [{"role": m.role, "content": m.content} for m in request.history]
    try:
        result = await run_agent(
            db,
            request.message,
            team_builder=request.team_builder,
            team_context=request.team,
            history=history,
        )
    except AgentUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ChatResponse(**result)


@router.post("/feedback", response_model=ChatFeedbackResponse)
async def chat_feedback(
    request: ChatFeedbackRequest, db: AsyncSession = Depends(get_db)
) -> ChatFeedbackResponse:
    """Thumbs up/down on a Professor turn. Downvotes feed the golden eval export."""
    row = ChatFeedback(
        turn_id=request.turn_id,
        rating=request.rating,
        message=request.message,
        answer=request.answer,
        comment=request.comment,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ChatFeedbackResponse(id=row.id, turn_id=row.turn_id, rating=row.rating)


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, db: AsyncSession = Depends(get_db)) -> None:
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            message = str(data.get("message", "")).strip()
            if not message:
                await websocket.send_json({"type": "error", "detail": "Empty message."})
                continue
            team_builder = bool(data.get("team_builder", False))
            team_context = [str(s) for s in (data.get("team") or [])]
            raw_history = data.get("history") or []
            history: list[dict[str, str]] = []
            if isinstance(raw_history, list):
                for turn in raw_history:
                    if not isinstance(turn, dict):
                        continue
                    role = str(turn.get("role", "")).strip()
                    content = str(turn.get("content", "")).strip()
                    if role in ("user", "assistant") and content:
                        history.append({"role": role, "content": content})
            try:
                async for event in stream_agent(
                    db,
                    message,
                    team_builder=team_builder,
                    team_context=team_context,
                    history=history,
                ):
                    await websocket.send_json(event)
            except AgentUnavailableError as exc:
                await websocket.send_json({"type": "error", "detail": str(exc)})
    except WebSocketDisconnect:
        pass
