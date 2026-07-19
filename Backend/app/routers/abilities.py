from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.pokemon import AbilityDetail, AbilitySummary
from app.tools.pokedex import get_ability_detail, list_abilities

router = APIRouter(prefix="/abilities", tags=["abilities"])


@router.get("", response_model=list[AbilitySummary])
async def browse_abilities(db: AsyncSession = Depends(get_db)) -> list[AbilitySummary]:
    return await list_abilities(db)


@router.get("/{ability_id}", response_model=AbilityDetail)
async def read_ability_detail(ability_id: str, db: AsyncSession = Depends(get_db)) -> AbilityDetail:
    ability = await get_ability_detail(db, ability_id)
    if ability is None:
        raise HTTPException(status_code=404, detail=f"No ability found with id '{ability_id}'")
    return ability
