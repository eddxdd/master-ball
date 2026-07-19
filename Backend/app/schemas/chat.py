"""Pydantic schemas for the chat endpoints — see app/routers/chat.py."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.rag import RetrievedChunk


class ChatHistoryMessage(BaseModel):
    """One prior turn sent from the client so follow-ups keep context."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str
    team_builder: bool = False
    team: list[str] = []
    """Recent prior turns (oldest → newest), excluding the current message."""
    history: list[ChatHistoryMessage] = []


class ChatResponse(BaseModel):
    answer: str
    needs_clarification: bool
    citations: list[RetrievedChunk]
    turn_id: str
    quality_warnings: list[str] = []


class ChatFeedbackRequest(BaseModel):
    turn_id: str
    rating: Literal["up", "down"]
    message: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    comment: str | None = None


class ChatFeedbackResponse(BaseModel):
    id: int
    turn_id: str
    rating: str
