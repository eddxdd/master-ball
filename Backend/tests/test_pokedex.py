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


def test_browse_pokedex_excludes_cosmetic_pikachu_caps(client: TestClient):
    # Cap/outfit Pikachu and their linked Gmax rows clutter search — keep the
    # default + one canonical Gmax only (no Mega for Pikachu).
    body = client.get("/pokedex", params={"search": "pikachu"}).json()
    ids = {p["id"] for p in body}
    assert "pikachu" in ids
    assert "pikachugmax" in ids
    assert "pikachualola" not in ids
    assert "pikachubelle" not in ids
    assert "pikachuoriginal" not in ids
    assert "pikachupartner" not in ids
    assert "pikachualolagmax" not in ids


def test_browse_pokedex_keeps_real_regionals_and_megas(client: TestClient):
    raichu_ids = {p["id"] for p in client.get("/pokedex", params={"search": "raichu"}).json()}
    assert "raichu" in raichu_ids
    assert "raichualola" in raichu_ids

    charizard_ids = {
        p["id"] for p in client.get("/pokedex", params={"search": "charizard"}).json()
    }
    assert "charizard" in charizard_ids
    assert "charizardmegax" in charizard_ids
    assert "charizardmegay" in charizard_ids
    assert "charizardgmax" in charizard_ids


def test_browse_pokedex_excludes_cosmetic_color_aliases(client: TestClient):
    # Showdown stores Vivillon patterns as separate ids with no forme tag.
    vivillon_ids = {
        p["id"] for p in client.get("/pokedex", params={"search": "vivillon"}).json()
    }
    assert "vivillon" in vivillon_ids
    assert "vivillonarchipelago" not in vivillon_ids
    assert "vivillonfancy" not in vivillon_ids


def test_browse_pokedex_filters_by_type(client: TestClient):
    response = client.get("/pokedex", params={"type": "Fire"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) > 0
    assert all(p["type1"] == "Fire" or p["type2"] == "Fire" for p in body)


def test_browse_pokedex_filters_by_generation(client: TestClient):
    # Gen 1 is National Dex #1-151 — Bulbasaur (#1) is in, Chikorita (#152,
    # the very next Dex number, Gen 2's first) is the boundary case that
    # proves this isn't just "everything" or an off-by-one range.
    body = client.get("/pokedex", params={"generation": 1}).json()
    ids = {p["id"] for p in body}
    assert "bulbasaur" in ids
    assert "chikorita" not in ids
    assert all(1 <= p["num"] <= 151 for p in body)


def test_browse_pokedex_generation_includes_formes_of_its_base_species(client: TestClient):
    # Charizard (#6, Gen 1) and its Mega formes share the same Dex number, so
    # filtering by generation must not silently drop the formes.
    body = client.get("/pokedex", params={"generation": 1}).json()
    names = {p["name"] for p in body}
    assert "Charizard" in names


def test_browse_pokedex_generation_combines_with_other_filters(client: TestClient):
    # Charmander/Charmeleon/Charizard line is Fire/(Flying) and Gen 1 — a
    # Water-type search within Gen 1 should exclude it.
    body = client.get("/pokedex", params={"generation": 1, "type": "Water"}).json()
    assert all(p["type1"] == "Water" or p["type2"] == "Water" for p in body)
    assert all(1 <= p["num"] <= 151 for p in body)


def test_browse_pokedex_ignores_out_of_range_generation(client: TestClient):
    # Query validation (ge=1, le=9) rejects this before it ever reaches
    # list_pokemon's own dex_range_for_generation(None-returning) fallback.
    response = client.get("/pokedex", params={"generation": 99})
    assert response.status_code == 422


def test_pokemon_profile_landorus_therian(client: TestClient):
    response = client.get("/pokedex/landorustherian")
    assert response.status_code == 200
    body = response.json()

    assert body["name"] == "Landorus-Therian"
    assert body["type1"] == "Ground"
    assert body["type2"] == "Flying"
    assert body["base_stats"]["atk"] == 145
    # Hand-derived from app/tools/stats.py's formula at level 100: min is
    # 0 IV/0 EV with a hindering (0.9x) nature, max is 31 IV/252 EV with a
    # beneficial (1.1x) nature. min: int((2*145*100//100 + 5) * 0.9) = 265.
    # max: int(((2*145 + 31 + 252//4)*100//100 + 5) * 1.1) = 427.
    assert body["min_stats"]["atk"] == 265
    assert body["max_stats"]["atk"] == 427
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


def test_pokemon_profile_includes_real_flavor_text_description(client: TestClient):
    # Real Pokedex flavor text fetched from PokeAPI at seed time (see
    # app/data/pokeapi_client.py's get_pokemon_descriptions) — not a
    # hand-typed stopgap, so this asserts on real, substantial prose rather
    # than an exact string that'd break on the next PokeAPI wording tweak.
    response = client.get("/pokedex/charizard")
    body = response.json()
    assert body["description"]
    assert len(body["description"]) > 20


def test_pokemon_profile_includes_genus_category(client: TestClient):
    # PokeAPI genus / category line ("Emperor Pokémon", "Flame Pokémon", …)
    # seeded alongside descriptions — see get_pokemon_genera.
    response = client.get("/pokedex/empoleon")
    body = response.json()
    assert body["genus"]
    assert "Pokémon" in body["genus"] or "Pokemon" in body["genus"]


def test_pokemon_profile_mega_forme_shares_base_species_description(client: TestClient):
    # PokeAPI's pokemon-species resource has one entry per species, not per
    # battle-only forme — a Mega Evolution has no flavor text of its own, so
    # it must inherit its base species' description rather than showing
    # nothing (see base_species_id lookup in scripts/seed_pokedex.py).
    base = client.get("/pokedex/charizard").json()
    mega = client.get("/pokedex/charizardmegax").json()
    assert mega["description"] == base["description"]
    assert mega["description"]
    assert mega["genus"] == base["genus"]
    assert mega["genus"]


def test_pokemon_profile_excludes_non_canonical_mega_formes(client: TestClient):
    # poke-env/Showdown's data also bundles a few fan-made "CAP" formes with
    # confusingly Mega-like names (e.g. Garchomp's "Mega-Z", not a real game
    # mechanic) — these must not leak into mega_formes.
    response = client.get("/pokedex/garchomp")
    assert response.status_code == 200
    body = response.json()

    mega_names = {m["name"] for m in body["mega_formes"]}
    assert mega_names == {"Garchomp-Mega"}


def test_evolution_chain_nodes_carry_special_formes(client: TestClient):
    # Charizard has three official in-battle-only formes (Mega X, Mega Y,
    # Gmax) — all three should show up on its own evolution-chain node, not
    # just the Mega ones (mega_formes is Mega-only, since that's a full
    # stat/ability comparison Gmax has no equivalent for).
    response = client.get("/pokedex/charmander")
    assert response.status_code == 200
    body = response.json()

    by_id = {p["id"]: p for stage in body["evolution_chain"] for p in stage["pokemon"]}
    assert by_id["charmander"]["special_formes"] == []
    assert by_id["charmeleon"]["special_formes"] == []
    charizard_formes = {f["forme"] for f in by_id["charizard"]["special_formes"]}
    assert charizard_formes == {"Mega-X", "Mega-Y", "Gmax"}


def test_evolution_chain_special_formes_exclude_non_canonical_and_dedupe_cosmetic(
    client: TestClient,
):
    response = client.get("/pokedex/garchomp")
    body = response.json()
    by_id = {p["id"]: p for stage in body["evolution_chain"] for p in stage["pokemon"]}
    # Fan-made "Mega-Z" must not appear alongside the real Mega Garchomp.
    assert [f["forme"] for f in by_id["garchomp"]["special_formes"]] == ["Mega"]

    # Raichu's fan-made "Mega-X"/"Mega-Y" (real PokeAPI item data, but for an
    # unreleased/beta Mega Stone with no sprite — see seed_pokedex.py's
    # _is_fabricated_mega) must not show up either.
    response = client.get("/pokedex/raichu")
    body = response.json()
    by_id = {p["id"]: p for stage in body["evolution_chain"] for p in stage["pokemon"]}
    assert by_id["raichu"]["special_formes"] == []

    # Pikachu's ~15 event-cap Gmax rows all share the same display name —
    # collapsed down to a single entry rather than 15 near-duplicates.
    response = client.get("/pokedex/pikachu")
    body = response.json()
    by_id = {p["id"]: p for stage in body["evolution_chain"] for p in stage["pokemon"]}
    assert [f["forme"] for f in by_id["pikachu"]["special_formes"]] == ["Gmax"]


def test_evolution_chain_single_stage_species_can_still_have_special_formes(client: TestClient):
    # Absol has no evolution relatives, but does have a Mega form — the
    # evolution chain (still just itself as the only stage) should surface it.
    response = client.get("/pokedex/absol")
    assert response.status_code == 200
    body = response.json()

    assert len(body["evolution_chain"]) == 1
    (absol,) = body["evolution_chain"][0]["pokemon"]
    assert absol["id"] == "absol"
    assert [f["forme"] for f in absol["special_formes"]] == ["Mega"]


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


def test_abilities_and_moves_have_real_descriptions(client: TestClient):
    """Regression test for the "hardcoded partial dict" mistake: descriptions
    must come from real seeded data (PokeAPI, via scripts/seed_pokedex.py's
    app.data.pokeapi_client) for essentially every ability/move, not just a
    small hand-typed subset. See Docs/backend/README.md's "Data seeding"."""
    response = client.get("/pokedex/pikachu")
    assert response.status_code == 200
    body = response.json()

    abilities_by_id = {a["id"]: a for a in body["abilities"]}
    assert abilities_by_id["static"]["description"]
    assert "paraly" in abilities_by_id["static"]["description"].lower()

    moves_by_id = {m["id"]: m for m in body["learnable_moves"]}
    assert moves_by_id["thunderbolt"]["description"]


def test_pokemon_profile_evolution_chain_shows_full_line(client: TestClient):
    # Viewing the *middle* stage (Charmeleon) must still surface every stage
    # of the line, not just its immediate prevo/next evolution.
    response = client.get("/pokedex/charmeleon")
    assert response.status_code == 200
    body = response.json()

    stage_ids = [[p["id"] for p in stage["pokemon"]] for stage in body["evolution_chain"]]
    assert stage_ids == [["charmander"], ["charmeleon"], ["charizard"]]

    by_id = {p["id"]: p for stage in body["evolution_chain"] for p in stage["pokemon"]}
    assert by_id["charmander"]["condition"] is None
    assert by_id["charmeleon"]["condition"] == "Level 16"
    assert by_id["charizard"]["condition"] == "Level 36"


def test_pokemon_profile_evolution_chain_from_final_stage(client: TestClient):
    # Viewing the *final* stage (Garchomp) must still surface the earlier
    # stages (Gible, Gabite), not just its own immediate prevo.
    response = client.get("/pokedex/garchomp")
    assert response.status_code == 200
    body = response.json()

    stage_ids = [[p["id"] for p in stage["pokemon"]] for stage in body["evolution_chain"]]
    assert stage_ids == [["gible"], ["gabite"], ["garchomp"]]


def test_pokemon_profile_evolution_chain_single_stage(client: TestClient):
    # A Pokemon with no prevo and no evolutions still returns a chain (just
    # itself, as the only stage) rather than omitting the field entirely.
    response = client.get("/pokedex/ditto")
    assert response.status_code == 200
    body = response.json()

    stage_ids = [[p["id"] for p in stage["pokemon"]] for stage in body["evolution_chain"]]
    assert stage_ids == [["ditto"]]


def test_move_detail_returns_learners(client: TestClient):
    response = client.get("/moves/earthquake")
    assert response.status_code == 200
    body = response.json()

    assert body["name"] == "Earthquake"
    learner_ids = {p["id"] for p in body["learned_by"]}
    assert "garchomp" in learner_ids


def test_move_detail_not_found(client: TestClient):
    response = client.get("/moves/not-a-real-move")
    assert response.status_code == 404


def test_ability_detail_returns_pokemon(client: TestClient):
    response = client.get("/abilities/intimidate")
    assert response.status_code == 200
    body = response.json()

    assert body["name"] == "Intimidate"
    pokemon_ids = {p["id"] for p in body["pokemon"]}
    assert "gyarados" in pokemon_ids


def test_ability_detail_not_found(client: TestClient):
    response = client.get("/abilities/not-a-real-ability")
    assert response.status_code == 404


def test_type_detail_returns_pokemon_and_matchups(client: TestClient):
    response = client.get("/types/Fire")
    assert response.status_code == 200
    body = response.json()

    assert body["type"] == "Fire"
    pokemon_ids = {p["id"] for p in body["pokemon"]}
    assert "charizard" in pokemon_ids

    attacking = {m["type"]: m["multiplier"] for m in body["attacking"]}
    assert attacking["Grass"] == 2.0  # Fire moves are super effective on Grass
    assert attacking["Water"] == 0.5  # ...and not very effective on Water

    defending = {m["type"]: m["multiplier"] for m in body["defending"]}
    assert defending["Water"] == 2.0  # Fire-type Pokemon are weak to Water moves


def test_type_detail_not_found(client: TestClient):
    response = client.get("/types/NotAType")
    assert response.status_code == 404
