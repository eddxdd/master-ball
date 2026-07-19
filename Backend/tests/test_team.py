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
    # Unlike species/ability/nature (normalized to ids — every frontend
    # control for those is an id-keyed Select), item is kept in its
    # already-properly-cased original text since the Team Builder's item
    # field is a plain text Input with no id->name map to render an id
    # through — see team_import.py's module docstring.
    assert lando["item"] == "Choice Scarf"
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

    # Per-member role cards — one entry per resolvable Pokemon, with a
    # non-empty heuristic role label (Choice Scarf Lando should read as a
    # revenge killer / sweeper, not a blank string).
    assert len(body["member_roles"]) == 2
    roles_by_name = {entry["name"]: entry for entry in body["member_roles"]}
    assert "revenge killer" in roles_by_name["Landorus-Therian"]["role"].lower()
    assert roles_by_name["Rotom-Wash"]["summary"]


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
    assert body["member_roles"] == []


def test_import_from_image_returns_503_when_gemini_not_configured(client: TestClient):
    # No GOOGLE_API_KEY set in this test environment — the honest failure
    # mode (per app/tools/vision_import.py's docstring), not a fake parse.
    response = client.post(
        "/team/import-image",
        files={"file": ("team.png", b"\x89PNG\r\n\x1a\nfake-image-bytes", "image/png")},
    )
    assert response.status_code == 503
    assert "GOOGLE_API_KEY" in response.json()["detail"]


def test_import_from_image_parses_a_mocked_gemini_transcription(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_extract(image_bytes, mime_type):  # noqa: ARG001
        return "Landorus-Therian @ Choice Scarf\nAbility: Intimidate\n- Earthquake\n"

    monkeypatch.setattr("app.routers.team.extract_team_from_image", fake_extract)

    response = client.post(
        "/team/import-image",
        files={"file": ("team.png", b"fake-image-bytes", "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert body["team"]["members"][0]["species_id"] == "landorustherian"


def test_suggest_teammates_returns_real_graph_derived_candidates(client: TestClient):
    # Landorus-Therian (Ground/Flying) is a real, always-present Pokedex
    # entry — this only asserts the HTTP plumbing/shape (a 200 with the
    # expected keys), not specific candidate identities, since those depend
    # on whatever usage-stats data happens to be synced/loaded into the
    # graph in a given environment; see tests/test_graph_query.py for
    # deterministic candidate-content assertions against a synthetic graph.
    response = client.post("/team/suggest-teammates", json={"species_ids": ["landorustherian"]})
    assert response.status_code == 200
    body = response.json()
    assert "team_weaknesses" in body
    assert "candidates" in body


def test_suggest_teammates_returns_empty_for_an_empty_team(client: TestClient):
    response = client.post("/team/suggest-teammates", json={"species_ids": []})
    assert response.status_code == 200
    assert response.json() == {"team_weaknesses": [], "candidates": []}
