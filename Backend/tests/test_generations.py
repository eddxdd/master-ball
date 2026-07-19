"""Unit tests for app/data/generations.py — no DB needed, these are pure
lookups. See test_pokedex.py's generation-filter tests for the API-level
assertions that this data actually reaches the query."""

from itertools import pairwise

from app.data.generations import GENERATIONS, dex_range_for_generation


def test_generations_cover_the_full_national_dex_with_no_gaps_or_overlaps():
    ordered = sorted(GENERATIONS, key=lambda g: g.number)
    assert ordered[0].start == 1
    for previous, current in pairwise(ordered):
        assert current.start == previous.end + 1


def test_dex_range_for_generation_returns_the_right_bounds():
    assert dex_range_for_generation(1) == (1, 151)
    assert dex_range_for_generation(9) == (906, 1025)


def test_dex_range_for_generation_returns_none_for_unknown_generation():
    assert dex_range_for_generation(0) is None
    assert dex_range_for_generation(99) is None
