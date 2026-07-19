"""Integration tests for the Items endpoint against the real seeded database
(see scripts/seed_pokedex.py's seed_items) — see test_pokedex.py's module
docstring for why real seeded data rather than mocks."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_item_detail_returns_real_data(client: TestClient):
    response = client.get("/items/lifeorb")
    assert response.status_code == 200
    body = response.json()

    assert body["name"] == "Life Orb"
    assert body["category"] == "held-items"
    assert body["fling_power"] == 30
    assert body["description"]
    assert "damage" in body["description"].lower()


def test_item_detail_not_found(client: TestClient):
    response = client.get("/items/not-a-real-item")
    assert response.status_code == 404


def test_item_scope_excludes_non_battle_items(client: TestClient):
    # Poke Balls and TMs are explicitly out of scope (see
    # Docs/backend/README.md's Items section) — not held battle items.
    response = client.get("/items/pokeball")
    assert response.status_code == 404
