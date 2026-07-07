"""Integration tests for the Pokedex tool/endpoints against the real seeded
database (see scripts/seed_pokedex.py) — this data is deterministic reference
data, not something worth mocking out."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    # Context manager (not a bare TestClient(app)) matters here: the async
    # SQLAlchemy engine's connection pool is bound to the event loop that's
    # live when a request first runs, and a bare TestClient spins up/tears
    # down a fresh loop per call once more than one request happens across
    # test functions, orphaning that pool ("Event loop is closed" on the
    # second call). The context manager keeps one loop alive for the test.
    with TestClient(app) as c:
        yield c


def test_browse_pokedex_returns_results(client: TestClient):
    response = client.get("/pokedex", params={"search": "pikachu"})
    assert response.status_code == 200
    body = response.json()
    assert any(p["id"] == "pikachu" for p in body)


def test_browse_pokedex_filters_by_type(client: TestClient):
    response = client.get("/pokedex", params={"type": "Fire"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) > 0
    assert all(p["type1"] == "Fire" or p["type2"] == "Fire" for p in body)


def test_pokemon_profile_landorus_therian(client: TestClient):
    response = client.get("/pokedex/landorustherian")
    assert response.status_code == 200
    body = response.json()

    assert body["name"] == "Landorus-Therian"
    assert body["type1"] == "Ground"
    assert body["type2"] == "Flying"
    assert body["base_stats"]["atk"] == 145
    # Inherits Landorus's movepool (Therian formes are eventOnly with no
    # learnset of their own — see scripts/seed_pokedex.py's fallback logic).
    assert len(body["learnable_moves"]) > 0
    assert any(m["id"] == "earthquake" for m in body["learnable_moves"])


def test_pokemon_profile_includes_mega_formes(client: TestClient):
    response = client.get("/pokedex/charizard")
    assert response.status_code == 200
    body = response.json()

    mega_names = {m["name"] for m in body["mega_formes"]}
    assert mega_names == {"Charizard-Mega-X", "Charizard-Mega-Y"}
    mega_x = next(m for m in body["mega_formes"] if m["name"] == "Charizard-Mega-X")
    assert mega_x["type2"] == "Dragon"
    assert mega_x["base_stats"]["atk"] == 130
    # Nested mega formes shouldn't recurse into their own mega_formes list.
    assert mega_x["mega_formes"] == []


def test_pokemon_profile_type_matchups_dual_type(client: TestClient):
    response = client.get("/pokedex/landorustherian")
    body = response.json()
    matchups = {m["type"]: m["multiplier"] for m in body["type_matchups"]}

    # Ground/Flying: Ice hits neutral on Flying (1x) but... combined with a
    # 4x weakness to Ice would be wrong here — Ground/Flying's real weakness
    # is Ice (via Ground) x1 * Flying x2 doesn't apply since Ice isn't 2x on
    # Flying either. Assert against known-correct real values instead.
    assert matchups["Electric"] == 0.0  # Flying negates Ground's Electric weakness
    assert matchups["Water"] == 2.0  # Ground's x2 Water weakness carries through
    assert matchups["Ice"] == 4.0  # Ground x2 * Flying x2


def test_pokemon_not_found(client: TestClient):
    response = client.get("/pokedex/not-a-real-pokemon")
    assert response.status_code == 404
