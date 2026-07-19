"""HTTP-layer tests for Phase 7's win-probability endpoint
(POST /ml/win-probability) — see tests/test_win_probability.py for the
tool-level feature-engineering/model-training coverage this only adds the
FastAPI wiring/503 path on top of.
"""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.session import engine
from app.main import app
from app.tools import win_probability
from scripts.train_win_probability_model import train_and_save


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
async def trained_model(monkeypatch):
    # See tests/test_win_probability.py's `trained_model` fixture docstring
    # for why this uses `tempfile` directly instead of pytest's `tmp_path`.
    with tempfile.TemporaryDirectory(prefix="masterball-win-prob-test-") as tmp_dir:
        model_path = Path(tmp_dir) / "win_probability_model.json"
        metadata_path = Path(tmp_dir) / "win_probability_model_metadata.json"
        monkeypatch.setattr(win_probability, "MODEL_PATH", model_path)
        monkeypatch.setattr("scripts.train_win_probability_model.MODEL_PATH", model_path)
        monkeypatch.setattr("scripts.train_win_probability_model.METADATA_PATH", metadata_path)
        win_probability._load_model.cache_clear()

        await train_and_save(n_samples=1500, team_size=3, seed=11)
        # Training opens DB connections on *this* fixture's event loop; the
        # `client` fixture's TestClient runs the app (and its own DB calls)
        # on a separate loop via Starlette's anyio blocking portal — without
        # disposing here first, the shared engine's pool hands the app a
        # connection bound to the wrong loop ("attached to a different
        # loop"). Same root cause as app/main.py's lifespan-shutdown dispose
        # comment, just needing to happen mid-test instead of at the end.
        await engine.dispose()
        yield
        win_probability._load_model.cache_clear()


def test_win_probability_returns_200_with_a_valid_probability(client: TestClient, trained_model):
    response = client.post(
        "/ml/win-probability",
        json={
            "team_a": {"members": [{"species_id": "landorustherian"}]},
            "team_b": {"members": [{"species_id": "pikachu"}]},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["team_a_win_probability"] <= 1.0
    assert "avg_hp" in body["team_a_features"]
    assert "avg_hp" in body["team_b_features"]
    assert "toy" in body["model_note"].lower()


def test_win_probability_returns_503_when_no_model_is_trained(client: TestClient, monkeypatch):
    with tempfile.TemporaryDirectory(prefix="masterball-win-prob-test-") as tmp_dir:
        monkeypatch.setattr(win_probability, "MODEL_PATH", Path(tmp_dir) / "missing.json")
        win_probability._load_model.cache_clear()

        response = client.post(
            "/ml/win-probability",
            json={
                "team_a": {"members": [{"species_id": "landorustherian"}]},
                "team_b": {"members": [{"species_id": "pikachu"}]},
            },
        )
        assert response.status_code == 503
        assert "train_win_probability_model" in response.json()["detail"]

        win_probability._load_model.cache_clear()
