"""Phase 5's opponent-scouting endpoint — see app/tools/scout.py."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.meta import ScoutReport
from app.tools.meta_stats import DEFAULT_FORMAT
from app.tools.scout import scout_opponent

router = APIRouter(prefix="/scout", tags=["scout"])


@router.get("/{species_id}", response_model=ScoutReport)
async def read_scout_report(
    species_id: str, format: str = DEFAULT_FORMAT, db: AsyncSession = Depends(get_db)
) -> ScoutReport:
    return await scout_opponent(db, species_id, format)
