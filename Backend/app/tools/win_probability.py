"""predict_win_probability — Phase 7's win-probability toy model, serving a
locally-trained XGBoost classifier (scripts/train_win_probability_model.py)
alongside this project's other, LLM-based team analysis (the Conversational
Team Doctor). See that script's module docstring and app/ml/simulate.py, and
Docs/backend/README.md's "Win probability model (Phase 7)" section, for the
load-bearing caveat: training labels come from a documented synthetic
simulator, not real logged match results, since no such dataset exists for
this project. What *is* real end to end: the feature engineering
(app/ml/features.py, computed from actual seeded Species/type-chart data),
the train/test-split-evaluated model, and the serving pipeline below.

Deliberately classical ML, not an LLM call — same reasoning as
app/tools/damage_calc.py and app/tools/team_analysis.py: this is a
structured, numeric, low-latency prediction over ~20 engineered features, a
task an LLM would be slower, costlier, and no more accurate at. XGBoost over
tabular features is the industry-standard tool for exactly this shape of
problem, which is the point of this module as a portfolio artifact.
"""

from functools import lru_cache
from pathlib import Path

import xgboost as xgb
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.features import FEATURE_NAMES, team_feature_vector
from app.models.pokemon import Species
from app.schemas.ml import WinProbabilityResult
from app.schemas.team import Team
from app.tools.type_chart import get_type_chart

MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "ml" / "win_probability_model.json"

MODEL_NOTE = (
    "Toy model: trained on a documented SYNTHETIC battle-outcome simulator, not real logged "
    "ladder match results (no such dataset exists for this project) — see "
    "Docs/backend/README.md's 'Win probability model (Phase 7)' section. Treat this as a "
    "demonstration of the ML pipeline (real feature engineering + XGBoost + serving), not a "
    "validated real-match predictor."
)


class ModelUnavailableError(Exception):
    """Raised when the trained model artifact hasn't been generated yet —
    the same 'real infra/setup problem, not a fabricated answer' shape as
    GraphUnavailableError/MissingProviderKeyError elsewhere in this app."""


@lru_cache(maxsize=1)
def _load_model() -> xgb.XGBClassifier:
    if not MODEL_PATH.exists():
        raise ModelUnavailableError(
            f"No trained win-probability model found at {MODEL_PATH}. Run "
            "`uv run python -m scripts.train_win_probability_model` first."
        )
    model = xgb.XGBClassifier()
    model.load_model(str(MODEL_PATH))
    return model


async def _species_for_team(db: AsyncSession, team: Team) -> list[Species]:
    species_ids = [m.species_id for m in team.members]
    if not species_ids:
        return []
    result = await db.execute(select(Species).where(Species.id.in_(species_ids)))
    species_map = {s.id: s for s in result.scalars().all()}
    return [species_map[sid] for sid in species_ids if sid in species_map]


async def predict_win_probability(
    db: AsyncSession, team_a: Team, team_b: Team
) -> WinProbabilityResult:
    model = _load_model()
    type_chart = await get_type_chart(db)

    species_a = await _species_for_team(db, team_a)
    species_b = await _species_for_team(db, team_b)

    features_a = team_feature_vector(species_a, type_chart)
    features_b = team_feature_vector(species_b, type_chart)

    row = [[*features_a, *features_b]]
    probability = float(model.predict_proba(row)[0][1])

    return WinProbabilityResult(
        team_a_win_probability=round(probability, 4),
        team_a_features=dict(zip(FEATURE_NAMES, features_a, strict=True)),
        team_b_features=dict(zip(FEATURE_NAMES, features_b, strict=True)),
        model_note=MODEL_NOTE,
    )


__all__ = ["ModelUnavailableError", "predict_win_probability"]
