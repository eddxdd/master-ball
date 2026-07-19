"""Schemas for Phase 3's Mental-Game Coach — battle logging, tilt detection,
and Web Push subscriptions. See app/tools/battle_log.py and
app/tools/push.py.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

BattleResult = Literal["win", "loss"]


class LogBattleResultRequest(BaseModel):
    client_id: str
    result: BattleResult
    note: str | None = None


class BattleLogEntryOut(BaseModel):
    id: int
    result: BattleResult
    note: str | None
    created_at: datetime


class TiltCheckResult(BaseModel):
    """The "two-loss rule" (see Docs/product-research.md) — a deterministic
    rule, not an LLM judgment call."""

    consecutive_losses: int
    nudge: bool
    message: str | None = None


class LogBattleResultResponse(BaseModel):
    entry: BattleLogEntryOut
    tilt_check: TiltCheckResult
    push_sent: bool
    """True only if a nudge fired *and* a push subscription existed *and* the
    send call succeeded — see app/tools/push.py."""


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    client_id: str
    endpoint: str
    keys: PushSubscriptionKeys


class VapidPublicKeyResponse(BaseModel):
    public_key: str | None
    """None if Web Push isn't configured locally (no VAPID keys set) — see
    Docs/backend/README.md's "Mental-Game Coach (Phase 3)" section. The
    frontend treats this as "don't offer the notification-permission prompt"
    rather than an error."""


class PostLossReviewRequest(BaseModel):
    client_id: str
    battle_log_entry_id: int | None = None
    """If given, that entry's note is used as context. Otherwise `note` below
    is used directly (e.g. reviewing a loss that wasn't logged first)."""
    note: str | None = None
