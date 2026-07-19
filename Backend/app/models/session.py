"""Phase 3's Mental-Game Coach tables — battle win/loss logging and Web Push
subscriptions. See Docs/roadmap.md's Phase 3 section and
Docs/backend/README.md's "Mental-Game Coach (Phase 3)" section for the
deliberate "anonymous client_id, not full accounts" scope decision.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class BattleLogEntry(Base):
    """One manually-logged win/loss, keyed by a client-generated anonymous id
    (see Docs/backend/README.md) rather than a real user account — there's no
    live game-state access here, the user reports the result themselves."""

    __tablename__ = "battle_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[str] = mapped_column(String, index=True)
    result: Mapped[str] = mapped_column(String)
    """"win" | "loss" — plain string, not an enum column, to avoid an Alembic
    enum-migration dance for a two-value field that's already validated at
    the Pydantic schema layer (app/schemas/session.py)."""
    note: Mapped[str | None] = mapped_column(Text, default=None)
    """Optional free-text the user jots down about the game — this is what
    the post-loss explanation flow (app/tools/battle_log.py) grounds its
    response in."""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PushSubscription(Base):
    """One row per client_id — a resubscribe (e.g. after clearing browser
    data) overwrites the previous row rather than accumulating stale ones,
    since there's no real value in notifying an endpoint the browser itself
    has already abandoned."""

    __tablename__ = "push_subscriptions"

    client_id: Mapped[str] = mapped_column(String, primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text)
    p256dh: Mapped[str] = mapped_column(String)
    auth: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
