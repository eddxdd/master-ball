from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.pokemon import TypeDetail
from app.tools.pokedex import get_type_detail

router = APIRouter(prefix="/types", tags=["types"])


@router.get("/{type_name}", response_model=TypeDetail)
async def read_type_detail(type_name: str, db: AsyncSession = Depends(get_db)) -> TypeDetail:
    type_detail = await get_type_detail(db, type_name)
    if type_detail is None:
        raise HTTPException(status_code=404, detail=f"Unknown type '{type_name}'")
    return type_detail
