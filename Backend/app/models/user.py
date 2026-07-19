"""Real user accounts (email/password + JWT) — see app/routers/auth.py and
Docs/roadmap.md's "Real login/auth system" note. Distinct from the anonymous
client_id used by the Mental-Game Coach (app/models/session.py); the two are
not yet linked (deferred, see the auth plan's v1 scope boundary).
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    display_name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
