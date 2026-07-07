from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.calculator import DamageCalcRequest, DamageCalcResult
from app.tools.damage_calc import DamageCalcError, calculate_damage

router = APIRouter(prefix="/calculator", tags=["calculator"])


@router.post("/damage", response_model=DamageCalcResult)
async def post_damage_calc(
    request: DamageCalcRequest, db: AsyncSession = Depends(get_db)
) -> DamageCalcResult:
    try:
        result = await calculate_damage(db, request)
    except DamageCalcError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Unknown species or move id.")
    return result
