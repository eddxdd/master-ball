"""Phase 5's meta/usage-stats table — one row per (format, species), synced
from Smogon's own publicly-published Chaos stats dumps
(https://www.smogon.com/stats/, e.g. `.../2026-05/chaos/gen9ou-1500.json`).
This is real, freely-published aggregate usage data (the same source Smogon's
own strategy pages cite), not scraped copyrighted analysis — see
scripts/sync_usage_stats.py for the ingestion job and
Docs/backend/README.md's "Meta/usage stats (Phase 5)" section for the full
scope note (why the latest-snapshot-only, upsert-in-place design, not a
historical time series).
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UsageStats(Base):
    __tablename__ = "usage_stats"
    __table_args__ = (
        UniqueConstraint("format", "species_id", name="uq_usage_stats_format_species"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    format: Mapped[str] = mapped_column(String, index=True)
    """Smogon format id, e.g. "gen9ou". Kept as a plain column (not a FK)
    since it's sourced entirely from the stats dump, not this app's own
    Pokedex data."""
    month: Mapped[str] = mapped_column(String)
    """Which monthly stats snapshot this row came from, e.g. "2026-05" —
    shown alongside the numbers so a stale sync is visible, not silently
    presented as current."""
    species_id: Mapped[str] = mapped_column(String, index=True)
    """to_id_str-normalized, matching Species.id where the Pokemon is also in
    this app's seeded Pokedex — not enforced as a real FK, since Smogon's
    stats can include formes/names this app's Gen-9-only seed doesn't."""
    species_name: Mapped[str] = mapped_column(String)
    rank: Mapped[int] = mapped_column(Integer)
    usage_percent: Mapped[float] = mapped_column(Float)
    raw_count: Mapped[int] = mapped_column(Integer)
    abilities: Mapped[dict] = mapped_column(JSONB, default=dict)
    items: Mapped[dict] = mapped_column(JSONB, default=dict)
    moves: Mapped[dict] = mapped_column(JSONB, default=dict)
    tera_types: Mapped[dict] = mapped_column(JSONB, default=dict)
    teammates: Mapped[dict] = mapped_column(JSONB, default=dict)
    checks_and_counters: Mapped[dict] = mapped_column(JSONB, default=dict)
    """Each of the six JSONB columns above stores this app's own already-
    normalized-to-percent top-N shape (see
    scripts/sync_usage_stats.py's `_top_n_as_percent`), not the raw
    Smogon weighted-count values — so `lookup_meta_stats` never has to
    re-derive a percentage at read time."""
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
