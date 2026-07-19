from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.items import ItemDetail, ItemSummary
from app.tools.items import get_item_detail, list_items

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=list[ItemSummary])
async def browse_items(db: AsyncSession = Depends(get_db)) -> list[ItemSummary]:
    return await list_items(db)


@router.get("/{item_id}", response_model=ItemDetail)
async def read_item_detail(item_id: str, db: AsyncSession = Depends(get_db)) -> ItemDetail:
    item = await get_item_detail(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"No item found with id '{item_id}'")
    return item
