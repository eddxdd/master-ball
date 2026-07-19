from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.pokemon import MoveDetail, MoveSummary
from app.tools.pokedex import get_move_detail, list_moves

router = APIRouter(prefix="/moves", tags=["moves"])


@router.get("", response_model=list[MoveSummary])
async def browse_moves(db: AsyncSession = Depends(get_db)) -> list[MoveSummary]:
    return await list_moves(db)


@router.get("/{move_id}", response_model=MoveDetail)
async def read_move_detail(move_id: str, db: AsyncSession = Depends(get_db)) -> MoveDetail:
    move = await get_move_detail(db, move_id)
    if move is None:
        raise HTTPException(status_code=404, detail=f"No move found with id '{move_id}'")
    return move
