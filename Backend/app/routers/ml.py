"""Phase 7's win-probability toy model endpoint — see
app/tools/win_probability.py's module docstring for the full "toy model,
synthetic training labels" caveat before reading too much into the result.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.ml import WinProbabilityRequest, WinProbabilityResult
from app.tools.win_probability import ModelUnavailableError
from app.tools.win_probability import predict_win_probability as predict_win_probability_tool

router = APIRouter(prefix="/ml", tags=["ml"])


@router.post("/win-probability", response_model=WinProbabilityResult)
async def win_probability(
    request: WinProbabilityRequest, db: AsyncSession = Depends(get_db)
) -> WinProbabilityResult:
    try:
        return await predict_win_probability_tool(db, request.team_a, request.team_b)
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
