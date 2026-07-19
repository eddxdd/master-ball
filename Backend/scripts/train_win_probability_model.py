"""Trains Phase 7's win-probability toy model — see app/ml/simulate.py's
module docstring for the full, upfront caveat on where the training labels
come from (a documented synthetic simulator, not real logged match results;
no such dataset is available to this project). This script's actual point is
the ML engineering pipeline end to end: real feature engineering from the
real seeded Pokedex, a train/test split, gradient-boosted trees, evaluation
metrics, and a served model artifact — not a claim of validated real-world
predictive accuracy. See Docs/backend/README.md's "Win probability model
(Phase 7)" section.

Deterministic given a fixed --seed (default 42) — Python's own `random.Random`
instance is seeded once and threaded through every sample, so re-running with
the same arguments reproduces the exact same training set and metrics.

Run: uv run python -m scripts.train_win_probability_model [--samples 20000] [--team-size 6]
"""

import argparse
import asyncio
import json
import random
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sqlalchemy import select

from app.db.session import AsyncSessionLocal, engine
from app.ml.features import combine_features, combined_feature_names, team_feature_vector
from app.ml.simulate import cross_type_matchup_advantage, simulate_outcome
from app.models.pokemon import Species
from app.tools.type_chart import get_type_chart

MODEL_DIR = Path(__file__).resolve().parent.parent / "app" / "data" / "ml"
MODEL_PATH = MODEL_DIR / "win_probability_model.json"
METADATA_PATH = MODEL_DIR / "win_probability_model_metadata.json"

DEFAULT_SAMPLES = 20000
DEFAULT_SEED = 42
DEFAULT_TEAM_SIZE = 6
MIN_TEAM_SIZE = 1


async def _load_all_species() -> list[Species]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Species))
        return list(result.scalars().all())


async def _load_type_chart() -> dict[tuple[str, str], float]:
    async with AsyncSessionLocal() as db:
        return await get_type_chart(db)


def generate_training_data(
    species: list[Species],
    type_chart: dict[tuple[str, str], float],
    n_samples: int,
    team_size: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Samples `n_samples` random team-A-vs-team-B pairs from the real
    Pokedex (uniform random, no format/tier restriction — this is a toy
    model, not a claim of OU-specific accuracy) and labels each with
    app/ml/simulate.py's synthetic outcome function. Team sizes vary by a
    couple slots below `team_size` so the model also sees partially-built
    teams, matching real Team Builder usage."""
    rng = random.Random(seed)
    feature_count = len(combined_feature_names())
    X = np.zeros((n_samples, feature_count), dtype=np.float32)
    y = np.zeros(n_samples, dtype=np.int32)

    for i in range(n_samples):
        size_a = rng.randint(max(MIN_TEAM_SIZE, team_size - 2), team_size)
        size_b = rng.randint(max(MIN_TEAM_SIZE, team_size - 2), team_size)
        team_a = rng.sample(species, size_a)
        team_b = rng.sample(species, size_b)

        features_a = team_feature_vector(team_a, type_chart)
        features_b = team_feature_vector(team_b, type_chart)
        matchup_advantage = cross_type_matchup_advantage(team_a, team_b, type_chart)

        X[i] = combine_features(features_a, features_b)
        y[i] = simulate_outcome(features_a, features_b, matchup_advantage, rng)

    return X, y


async def train_and_save(
    n_samples: int = DEFAULT_SAMPLES, team_size: int = DEFAULT_TEAM_SIZE, seed: int = DEFAULT_SEED
) -> dict:
    """Async so it can be awaited directly from an already-running event loop
    (e.g. tests/test_win_probability.py's fixtures, which run inside
    pytest-asyncio's loop) — `main()` below is the only caller that needs its
    own fresh `asyncio.run()`. The actual model-fitting work (numpy/sklearn/
    xgboost) is synchronous/CPU-bound either way; only the DB reads are
    genuinely async."""
    species = await _load_all_species()
    type_chart = await _load_type_chart()
    if len(species) < team_size:
        raise RuntimeError(
            f"Only {len(species)} species in the DB — run `scripts/seed_pokedex.py` first."
        )

    X, y = generate_training_data(species, type_chart, n_samples, team_size, seed)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=seed,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]
    metrics = {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "auc": float(roc_auc_score(y_test, probabilities)),
        "log_loss": float(log_loss(y_test, probabilities)),
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save_model(str(MODEL_PATH))

    metadata = {
        "trained_at": datetime.now(UTC).isoformat(),
        "n_samples": n_samples,
        "team_size": team_size,
        "seed": seed,
        "feature_names": combined_feature_names(),
        "metrics": metrics,
        "note": (
            "Trained on a documented SYNTHETIC battle-outcome simulator (app/ml/simulate.py), "
            "not real logged match results — no such dataset exists for this project. See "
            "Docs/backend/README.md's 'Win probability model (Phase 7)' section."
        ),
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2))
    return metrics


async def _run(samples: int, team_size: int, seed: int) -> None:
    metrics = await train_and_save(samples, team_size, seed)
    print(f"Trained win-probability model on {samples} synthetic samples:")
    for key, value in metrics.items():
        print(f"  {key}: {value}")
    print(f"Saved model to {MODEL_PATH}")
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES)
    parser.add_argument("--team-size", type=int, default=DEFAULT_TEAM_SIZE)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()

    asyncio.run(_run(args.samples, args.team_size, args.seed))


if __name__ == "__main__":
    main()
