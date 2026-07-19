"""Tests for Phase 7's win-probability toy model — app/ml/features.py,
app/ml/simulate.py, app/tools/win_probability.py, and
scripts/train_win_probability_model.py. See those modules' docstrings for
the "synthetic training labels, real feature engineering" scope note this
whole test file assumes.

`trained_model` trains a small (n_samples=3000), fast model against a
temp-file model path (never touching the real
app/data/ml/win_probability_model.json artifact) so this suite is
self-contained and doesn't depend on scripts/train_win_probability_model.py
having already been run in this environment.
"""

import tempfile
from pathlib import Path

import pytest

from app.db.session import AsyncSessionLocal
from app.ml.features import FEATURE_NAMES, team_feature_vector
from app.ml.simulate import cross_type_matchup_advantage
from app.models.pokemon import Species
from app.schemas.team import PokemonSet, Team
from app.tools import win_probability
from app.tools.type_chart import get_type_chart
from app.tools.win_probability import ModelUnavailableError, predict_win_probability
from scripts.train_win_probability_model import train_and_save


def _make_species(species_id: str, type1: str, type2: str | None, **stats: int) -> Species:
    base_stats = {"hp": 100, "atk": 100, "def": 100, "spa": 100, "spd": 100, "spe": 100}
    base_stats.update(stats)
    return Species(
        id=species_id,
        num=0,
        name=species_id,
        type1=type1,
        type2=type2,
        base_stats=base_stats,
        abilities={},
        learnable_moves=[],
        sprite_url="",
        evos=[],
    )


@pytest.fixture
async def trained_model(monkeypatch):
    # Uses Python's own tempfile (a fresh uniquely-named dir under the OS
    # temp root) rather than pytest's `tmp_path` fixture, which shares a
    # single persistent `pytest-of-<user>` base directory across runs — on
    # this project's Windows dev environment that base directory has picked
    # up a stale ACL that denies write access, unrelated to this test.
    with tempfile.TemporaryDirectory(prefix="masterball-win-prob-test-") as tmp_dir:
        model_path = Path(tmp_dir) / "win_probability_model.json"
        metadata_path = Path(tmp_dir) / "win_probability_model_metadata.json"
        monkeypatch.setattr(win_probability, "MODEL_PATH", model_path)
        monkeypatch.setattr("scripts.train_win_probability_model.MODEL_PATH", model_path)
        monkeypatch.setattr("scripts.train_win_probability_model.METADATA_PATH", metadata_path)
        win_probability._load_model.cache_clear()

        metrics = await train_and_save(n_samples=3000, team_size=4, seed=7)
        yield metrics

        win_probability._load_model.cache_clear()


def test_team_feature_vector_returns_a_zero_vector_for_an_empty_team():
    type_chart: dict[tuple[str, str], float] = {}
    assert team_feature_vector([], type_chart) == [0.0] * len(FEATURE_NAMES)


async def test_team_feature_vector_averages_real_base_stats():
    fast_mon = _make_species("fastmon", "Electric", None, spe=200, hp=50)
    slow_mon = _make_species("slowmon", "Water", None, spe=10, hp=150)

    async with AsyncSessionLocal() as db:
        type_chart = await get_type_chart(db)

    features = team_feature_vector([fast_mon, slow_mon], type_chart)
    feature_map = dict(zip(FEATURE_NAMES, features, strict=True))

    assert feature_map["avg_spe"] == pytest.approx(105.0)
    assert feature_map["avg_hp"] == pytest.approx(100.0)
    assert feature_map["type_diversity"] == 2.0
    assert feature_map["team_size"] == 2.0


async def test_cross_type_matchup_advantage_favors_the_super_effective_side():
    water_mon = _make_species("watermon", "Water", None)
    fire_mon = _make_species("firemon", "Fire", None)

    async with AsyncSessionLocal() as db:
        type_chart = await get_type_chart(db)

    # Water is super effective against Fire, and Fire isn't super effective
    # back against Water — a real, unambiguous type-chart fact.
    advantage = cross_type_matchup_advantage([water_mon], [fire_mon], type_chart)
    assert advantage > 0


async def test_cross_type_matchup_advantage_is_zero_for_an_empty_side():
    async with AsyncSessionLocal() as db:
        type_chart = await get_type_chart(db)
    assert cross_type_matchup_advantage([], [], type_chart) == 0.0


def test_train_and_save_produces_a_model_with_real_predictive_signal(trained_model):
    # A meaningfully-above-chance AUC on held-out data demonstrates the model
    # recovered the (deliberately noisy) synthetic outcome function's real
    # structure from labeled examples — not that it predicts real human
    # ladder outcomes (see this module's docstring/app/ml/simulate.py).
    assert trained_model["auc"] > 0.55
    assert 0.0 <= trained_model["accuracy"] <= 1.0
    assert trained_model["test_samples"] > 0


async def test_predict_win_probability_returns_a_valid_probability_and_features(trained_model):
    team_a = Team(members=[PokemonSet(species_id="landorustherian")])
    team_b = Team(members=[PokemonSet(species_id="pikachu")])

    async with AsyncSessionLocal() as db:
        result = await predict_win_probability(db, team_a, team_b)

    assert 0.0 <= result.team_a_win_probability <= 1.0
    assert set(result.team_a_features.keys()) == set(FEATURE_NAMES)
    assert set(result.team_b_features.keys()) == set(FEATURE_NAMES)
    assert "synthetic" in result.model_note.lower() or "toy" in result.model_note.lower()


async def test_predict_win_probability_handles_an_empty_team(trained_model):
    async with AsyncSessionLocal() as db:
        result = await predict_win_probability(db, Team(members=[]), Team(members=[]))
    assert 0.0 <= result.team_a_win_probability <= 1.0


async def test_predict_win_probability_raises_when_no_model_is_trained_yet(monkeypatch):
    with tempfile.TemporaryDirectory(prefix="masterball-win-prob-test-") as tmp_dir:
        monkeypatch.setattr(win_probability, "MODEL_PATH", Path(tmp_dir) / "does_not_exist.json")
        win_probability._load_model.cache_clear()

        async with AsyncSessionLocal() as db:
            with pytest.raises(ModelUnavailableError, match="No trained win-probability model"):
                await predict_win_probability(db, Team(members=[]), Team(members=[]))

        win_probability._load_model.cache_clear()
