from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.search import SearchResults
from app.tools.search import search_all

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResults)
async def search(q: str = "", db: AsyncSession = Depends(get_db)) -> SearchResults:
    return await search_all(db, q)
