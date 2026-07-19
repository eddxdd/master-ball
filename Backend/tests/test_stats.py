"""Unit tests for app/tools/stats.py — no DB needed, these are pure functions.
See test_pokedex.py's test_pokemon_profile_landorus_therian for the matching
integration-level assertion (that this formula's output actually reaches the
API response)."""

from app.tools.stats import calculate_stat, min_max_stats


def test_min_max_stats_matches_hand_derived_values():
    # Landorus-Therian's real base Atk (145) — same figure test_pokedex.py's
    # API-level test asserts on, so a mismatch between the two would be
    # immediately obvious.
    minimum, maximum = min_max_stats({"atk": 145})
    assert minimum["atk"] == 265
    assert maximum["atk"] == 427


def test_min_max_stats_ignores_nature_for_hp():
    # HP has no nature, so the only difference between min and max should be
    # the IV/EV spread, not a 0.9x/1.1x multiplier like every other stat.
    minimum, maximum = min_max_stats({"hp": 100})
    assert minimum["hp"] == calculate_stat(100, iv=0, ev=0, level=100, is_hp=True)
    assert maximum["hp"] == calculate_stat(100, iv=31, ev=252, level=100, is_hp=True)


def test_min_max_stats_handles_shedinja_base_hp_of_one():
    # Shedinja's real base HP (1) always yields exactly 1 HP, regardless of
    # IVs/EVs — see calculate_stat's docstring for why. The min/max range
    # should collapse to a single value rather than showing a spread that
    # can't actually happen in-game.
    minimum, maximum = min_max_stats({"hp": 1})
    assert minimum["hp"] == 1
    assert maximum["hp"] == 1


def test_min_max_stats_covers_every_key_passed_in():
    minimum, maximum = min_max_stats({"hp": 80, "atk": 90, "spe": 100})
    assert set(minimum) == {"hp", "atk", "spe"}
    assert set(maximum) == {"hp", "atk", "spe"}
