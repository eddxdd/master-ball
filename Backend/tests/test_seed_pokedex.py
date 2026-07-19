"""Unit tests for scripts/seed_pokedex.py's `_is_fabricated_mega` and
`_movepool_for`/`_prevo_inherited_moves` — pure functions, no DB needed, so
these run as fast, deterministic unit tests rather than depending on a real
seeded database like test_pokedex.py's own (integration-level) regression
tests do.
"""

from types import SimpleNamespace

from scripts.seed_pokedex import GEN, _is_fabricated_mega, _movepool_for


def _mega_species(forme: str = "Mega", required_item: str | None = "Testite") -> dict:
    return {"forme": forme, "requiredItem": required_item}


def test_is_fabricated_mega_false_for_real_stone_with_official_sprite():
    items = {"testite": {"category": "mega-stones", "official_sprite": True}}
    assert _is_fabricated_mega(_mega_species(), items) is False


def test_is_fabricated_mega_true_when_item_has_no_official_sprite():
    # The core regression this guards: an item lacking PokeAPI's own flat
    # "official" sprite is fabricated even if it has some *other* sprite_url
    # (e.g. app/data/pokeapi_client.py's display-only generation-folder
    # fallback, which the community sprites repo turns out to also carry
    # fan art for non-canonical CAP stones through — see that fallback's
    # docstring). Using `sprite_url` truthiness here instead of
    # `official_sprite` would wrongly call this one real.
    items = {
        "testite": {
            "category": "mega-stones",
            "official_sprite": False,
            "sprite_url": "https://example.com/fan-art-only.png",
        }
    }
    assert _is_fabricated_mega(_mega_species(), items) is True


def test_is_fabricated_mega_true_when_item_unknown_to_pokeapi():
    assert _is_fabricated_mega(_mega_species(), {}) is True


def test_is_fabricated_mega_false_for_non_mega_formes():
    assert _is_fabricated_mega(_mega_species(forme="Gmax"), {}) is False
    assert _is_fabricated_mega({"forme": None, "requiredItem": None}, {}) is False


def test_is_fabricated_mega_false_when_no_required_item():
    assert _is_fabricated_mega(_mega_species(required_item=None), {}) is False


def _fake_gen_data(pokedex: dict, learnset: dict) -> SimpleNamespace:
    """A minimal stand-in for poke-env's `GenData` — `_movepool_for` (and
    the `_prevo_inherited_moves` helper it calls) only ever reads its
    `.pokedex`/`.learnset` dict attributes, so a real `GenData` (which
    needs a real generation's full bundled dataset) isn't needed here."""
    return SimpleNamespace(pokedex=pokedex, learnset=learnset)


def test_movepool_for_inherits_egg_moves_from_earlier_evolution_stages():
    """The regression this guards: Showdown's own learnset data lists an
    egg move only on the earliest stage that can actually breed for it
    (e.g. real Sucker Punch/Pawniard/Bisharp/Kingambit — see
    `_prevo_inherited_moves`'s docstring) — a fully-evolved Kingambit's own
    learnset entry omits it entirely even though the real games (and real
    ladder usage, per Docs/backend/README.md) let it run the move."""
    pokedex = {
        "stage1": {"prevo": None},
        "stage2": {"prevo": "Stage1"},
        "stage3": {"prevo": "Stage2"},
    }
    learnset = {
        "stage1": {"learnset": {"eggmove": [f"{GEN}E"], "tackle": [f"{GEN}L1"]}},
        "stage2": {"learnset": {"tackle": [f"{GEN}L1"]}},
        "stage3": {"learnset": {"hyperbeam": [f"{GEN}M"]}},
    }
    gen_data = _fake_gen_data(pokedex, learnset)

    movepool = _movepool_for(gen_data, "stage3", "stage3", is_forme=False)

    assert "eggmove" in movepool
    assert "tackle" in movepool
    assert "hyperbeam" in movepool


def test_movepool_for_ignores_moves_from_a_different_generation():
    pokedex = {"stage1": {"prevo": None}, "stage2": {"prevo": "Stage1"}}
    learnset = {
        "stage1": {"learnset": {"oldmove": ["8E"]}},
        "stage2": {"learnset": {}},
    }
    gen_data = _fake_gen_data(pokedex, learnset)

    movepool = _movepool_for(gen_data, "stage2", "stage2", is_forme=False)

    assert "oldmove" not in movepool


def test_movepool_for_handles_missing_prevo_data_without_crashing():
    gen_data = _fake_gen_data(
        {"solo": {"prevo": None}}, {"solo": {"learnset": {"tackle": [f"{GEN}L1"]}}}
    )
    assert _movepool_for(gen_data, "solo", "solo", is_forme=False) == ["tackle"]
