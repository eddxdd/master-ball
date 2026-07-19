"""Phase 5's meta/usage-stats endpoint — see app/tools/meta_stats.py and
scripts/sync_usage_stats.py.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.meta import MetaLeaderboard, MetaStatsResult
from app.tools.meta_stats import (
    DEFAULT_FORMAT,
    DEFAULT_LEADERBOARD_LIMIT,
    lookup_meta_leaderboard,
    lookup_meta_stats,
)

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("", response_model=MetaLeaderboard)
@router.get("/", response_model=MetaLeaderboard, include_in_schema=False)
async def read_meta_leaderboard(
    format: str = DEFAULT_FORMAT,
    limit: int = Query(DEFAULT_LEADERBOARD_LIMIT, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> MetaLeaderboard:
    """Format-wide usage snapshot — top-N ladder + type distribution for the
    homepage dashboard. Falls back to the gen9ou demo pack when unsynced."""
    return await lookup_meta_leaderboard(db, format, limit)


@router.get("/{species_id}", response_model=MetaStatsResult)
async def read_meta_stats(
    species_id: str, format: str = DEFAULT_FORMAT, db: AsyncSession = Depends(get_db)
) -> MetaStatsResult:
    result = await lookup_meta_stats(db, species_id, format)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No synced usage stats for '{species_id}' in format '{format}' yet — run "
                "`uv run python -m scripts.sync_usage_stats`."
            ),
        )
    return result
