"""calculate_damage tests, run against the real seeded Pokedex data (see
scripts/seed_pokedex.py). Expected values are hand-computed from the official
Gen 9 formula (Bulbapedia) — see Docs/backend/damage-calc.md — not copied from
an external calculator, so each one shows its own arithmetic in a comment.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _request(attacker: dict, defender: dict, move_id: str, field: dict | None = None) -> dict:
    return {
        "attacker": attacker,
        "defender": defender,
        "move_id": move_id,
        "field": field or {},
    }


def test_earthquake_landorus_therian_vs_pikachu(client: TestClient):
    # Atk = int(((2*145 + 31 + 252//4) * 100 // 100) + 5) = 389 (Jolly doesn't touch Atk)
    # Def (Pikachu, 0 EVs, neutral nature) = int(((2*40 + 31) * 100 // 100) + 5) = 116
    # base_damage = (2*100//5 + 2) * 100 * 389 // 116 // 50 + 2 = 283
    # modifiers = STAB (1.5, Ground is one of Landorus-T's types) * type effectiveness
    #   (Ground is x2 vs pure-Electric Pikachu) = 3.0
    # rolls = int(283 * 3.0 * pct / 100) for pct in 85..100
    attacker = {
        "species_id": "landorustherian",
        "nature": "jolly",
        "evs": {"atk": 252},
    }
    defender = {"species_id": "pikachu", "nature": "hardy"}

    response = client.post("/calculator/damage", json=_request(attacker, defender, "earthquake"))
    assert response.status_code == 200
    body = response.json()

    assert body["type_effectiveness"] == 2.0
    assert body["stab_multiplier"] == 1.5
    assert body["min_damage"] == 721
    assert body["max_damage"] == 849
    assert body["rolls"] == [
        721, 730, 738, 747, 755, 764, 772, 781, 789, 798, 806, 815, 823, 832, 840, 849,
    ]  # fmt: skip


def test_ground_move_is_immune_against_flying_type(client: TestClient):
    attacker = {"species_id": "landorustherian", "evs": {"atk": 252}, "nature": "jolly"}
    defender = {"species_id": "pidgey", "nature": "hardy"}  # Normal/Flying

    response = client.post("/calculator/damage", json=_request(attacker, defender, "earthquake"))
    body = response.json()

    assert body["is_immune"] is True
    assert body["type_effectiveness"] == 0.0
    assert body["rolls"] == [0] * 16
    assert body["ko_chance_description"] == "No KO"


def test_critical_hit_ignores_defender_positive_defense_stage(client: TestClient):
    attacker = {"species_id": "landorustherian", "evs": {"atk": 252}, "nature": "jolly"}
    defender_boosted = {
        "species_id": "pikachu",
        "nature": "hardy",
        "stat_stages": {"def": 2},
    }
    defender_unboosted = {"species_id": "pikachu", "nature": "hardy"}

    boosted_crit = client.post(
        "/calculator/damage",
        json=_request(attacker, defender_boosted, "earthquake", {"is_critical": True}),
    ).json()
    unboosted_crit = client.post(
        "/calculator/damage",
        json=_request(attacker, defender_unboosted, "earthquake", {"is_critical": True}),
    ).json()

    # A crit ignores the defender's +2 Defense entirely, so both should deal
    # identical damage despite the boosted defender's higher stat_stages input.
    assert boosted_crit["max_damage"] == unboosted_crit["max_damage"]


def test_burn_halves_physical_damage_unless_guts(client: TestClient):
    attacker_healthy = {"species_id": "landorustherian", "evs": {"atk": 252}, "nature": "jolly"}
    attacker_burned = {**attacker_healthy, "status": "brn"}
    defender = {"species_id": "pikachu", "nature": "hardy"}

    healthy = client.post(
        "/calculator/damage", json=_request(attacker_healthy, defender, "earthquake")
    ).json()
    burned = client.post(
        "/calculator/damage", json=_request(attacker_burned, defender, "earthquake")
    ).json()

    assert burned["max_damage"] == pytest.approx(healthy["max_damage"] * 0.5, abs=1)


def test_choice_band_boosts_physical_attack(client: TestClient):
    defender = {"species_id": "pikachu", "nature": "hardy"}
    plain = {"species_id": "landorustherian", "evs": {"atk": 252}, "nature": "jolly"}
    banded = {**plain, "item": "Choice Band"}

    plain_result = client.post(
        "/calculator/damage", json=_request(plain, defender, "earthquake")
    ).json()
    banded_result = client.post(
        "/calculator/damage", json=_request(banded, defender, "earthquake")
    ).json()

    assert banded_result["max_damage"] > plain_result["max_damage"]


def test_status_move_is_rejected(client: TestClient):
    attacker = {"species_id": "landorustherian"}
    defender = {"species_id": "pikachu"}

    response = client.post("/calculator/damage", json=_request(attacker, defender, "thunderwave"))
    assert response.status_code == 400


def test_unknown_species_returns_404(client: TestClient):
    attacker = {"species_id": "not-a-real-pokemon"}
    defender = {"species_id": "pikachu"}

    response = client.post("/calculator/damage", json=_request(attacker, defender, "earthquake"))
    assert response.status_code == 404
