"""Pydantic schemas for Phase 7's win-probability toy model — see
app/tools/win_probability.py's module docstring for the full "toy model,
synthetic training labels" caveat before reading too much into the numbers
these schemas carry.
"""

from pydantic import BaseModel

from app.schemas.team import Team


class WinProbabilityRequest(BaseModel):
    team_a: Team
    team_b: Team


class WinProbabilityResult(BaseModel):
    team_a_win_probability: float
    """Probability (0-1) team_a is predicted to win. team_b's implied
    probability is simply 1 minus this — the underlying model is a single
    binary classifier, not two independent predictions."""
    team_a_features: dict[str, float]
    team_b_features: dict[str, float]
    model_note: str
