import pytest
from fastapi.testclient import TestClient

from app.main import app

SAMPLE_TEAM = """Landorus-Therian @ Choice Scarf
Ability: Intimidate
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Stone Edge
- U-turn
- Explosion

Wet Blanket (Rotom-Wash) @ Leftovers
Ability: Levitate
Tera Type: Water
EVs: 252 HP / 4 SpD / 252 Spe
Bold Nature
- Volt Switch
- Hydro Pump
- Will-O-Wisp
- Protect
"""


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_import_parses_species_item_ability_nature_evs_moves(client: TestClient):
    response = client.post("/team/import", json={"text": SAMPLE_TEAM})
    assert response.status_code == 200
    body = response.json()

    assert body["warnings"] == []
    members = body["team"]["members"]
    assert len(members) == 2

    lando = members[0]
    assert lando["species_id"] == "landorustherian"
    assert lando["nickname"] is None
    assert lando["item"] == "choicescarf"
    assert lando["ability"] == "intimidate"
    assert lando["nature"] == "jolly"
    assert lando["evs"] == {"atk": 252, "spd": 4, "spe": 252}
    assert set(lando["moves"]) == {"earthquake", "stoneedge", "uturn", "explosion"}

    rotom = members[1]
    assert rotom["species_id"] == "rotomwash"
    assert rotom["nickname"] == "Wet Blanket"
    assert rotom["tera_type"] == "Water"


def test_import_warns_on_unrecognized_species(client: TestClient):
    text = "Not A Real Pokemon\nAbility: None\n- Tackle\n"
    response = client.post("/team/import", json={"text": text})
    assert response.status_code == 200
    body = response.json()
    assert len(body["warnings"]) == 1


def test_analyze_team_type_coverage_and_speed_tiers(client: TestClient):
    import_response = client.post("/team/import", json={"text": SAMPLE_TEAM})
    team = import_response.json()["team"]

    response = client.post("/team/analyze", json=team)
    assert response.status_code == 200
    body = response.json()

    speed_order = [entry["name"] for entry in body["speed_tiers"]]
    assert speed_order == ["Landorus-Therian", "Rotom-Wash"]  # both 252 Spe, Lando has higher base

    coverage_by_type = {entry["type"]: entry for entry in body["type_coverage"]}
    # Rotom-Wash (Electric/Water) is immune to Ground and Landorus-T
    # (Ground/Flying) is immune to Electric -- neither is weak to either.
    assert coverage_by_type["Ground"]["immune_count"] == 1
    assert coverage_by_type["Electric"]["immune_count"] == 1


def test_analyze_team_flags_shared_weakness(client: TestClient):
    # Landorus-T (Ground/Flying), Garchomp (Dragon/Ground), and Salamence
    # (Dragon/Flying) are all at least 2x weak to Ice.
    team = {
        "members": [
            {"species_id": "landorustherian", "nature": "jolly"},
            {"species_id": "garchomp", "nature": "jolly"},
            {"species_id": "salamence", "nature": "adamant"},
        ]
    }
    response = client.post("/team/analyze", json=team)
    body = response.json()

    flags = {f["flag"] for f in body["role_flags"]}
    assert "shared_weakness_ice" in flags


def test_analyze_team_skips_unresolvable_species(client: TestClient):
    team = {"members": [{"species_id": "not-a-real-pokemon"}]}
    response = client.post("/team/analyze", json=team)
    assert response.status_code == 200
    body = response.json()
    assert body["speed_tiers"] == []
    assert body["weakness_matrix"] == []
