"""Integration tests for the global header search endpoint against the real
seeded database — see test_pokedex.py's module docstring for why real seeded
data rather than mocks, and app/tools/search.py for the ranking/scope rules."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_search_finds_a_pokemon(client: TestClient):
    response = client.get("/search", params={"q": "charizard"})
    assert response.status_code == 200
    body = response.json()

    names = [p["name"] for p in body["pokemon"]]
    assert "Charizard" in names
    charizard = next(p for p in body["pokemon"] if p["name"] == "Charizard")
    assert charizard["subtitle"] == "Fire/Flying"
    assert charizard["sprite_url"]


def test_search_finds_a_move_ability_and_item(client: TestClient):
    moves = client.get("/search", params={"q": "thunderbolt"}).json()["moves"]
    assert any(m["name"] == "Thunderbolt" for m in moves)

    abilities = client.get("/search", params={"q": "intimidate"}).json()["abilities"]
    assert any(a["name"] == "Intimidate" for a in abilities)

    items = client.get("/search", params={"q": "life orb"}).json()["items"]
    assert any(i["name"] == "Life Orb" for i in items)


def test_search_finds_a_type(client: TestClient):
    body = client.get("/search", params={"q": "fir"}).json()
    assert body["types"] == [{"id": "Fire", "name": "Fire", "subtitle": None, "sprite_url": None}]


def test_search_is_case_insensitive_and_matches_substrings(client: TestClient):
    body = client.get("/search", params={"q": "CHARI"}).json()
    assert any(p["name"] == "Charizard" for p in body["pokemon"])


def test_search_ranks_prefix_matches_before_substring_matches(client: TestClient):
    # Every real move containing "thunder" happens to *start* with it except
    # "10,000,000 Volt Thunderbolt" — asserting it's excluded from the
    # (limit-bounded) results proves prefix matches outrank substring-only
    # ones, not just that results happen to be alphabetical.
    moves = client.get("/search", params={"q": "thunder"}).json()["moves"]
    names = [m["name"] for m in moves]
    assert names[0] == "Thunder"
    assert "10,000,000 Volt Thunderbolt" not in names


def test_search_with_empty_query_returns_no_results(client: TestClient):
    body = client.get("/search", params={"q": ""}).json()
    assert body == {"pokemon": [], "moves": [], "abilities": [], "items": [], "types": []}

    body_default = client.get("/search").json()
    assert body_default == body


def test_search_excludes_non_battle_relevant_items(client: TestClient):
    # Poke Balls are explicitly out of scope — see test_items.py's matching
    # assertion and Docs/backend/README.md's Items section.
    body = client.get("/search", params={"q": "poke ball"}).json()
    assert body["items"] == []
