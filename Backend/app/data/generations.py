"""Generation <-> National Dex number boundaries — official, unchanging game
data (Gen 9 caps at 1025 to include the Scarlet/Violet DLC's Pecharunt), not
anything derived from the seeded DB. Backs the Pokedex browser's generation
tabs (`GET /pokedex?generation=N`). Deliberately duplicated on the frontend
(`Frontend/src/lib/generations.ts`) for the tab labels rather than fetched
from an endpoint — same "static game data, duplicated client-side on purpose"
precedent as natures.ts (see Docs/frontend/README.md's folder-layout notes on
that file); the backend copy here is the one that actually filters, so the
two can never disagree on *whether* a Pokemon is in a generation, only on
label text if a name ever changes.

A forme (e.g. Charizard-Mega-X) always shares its base species' National Dex
number, so filtering on `Species.num` alone — with no separate per-forme
generation field — already puts every forme in the same generation as its
base species, which is the only sensible behavior.
"""

from typing import NamedTuple


class Generation(NamedTuple):
    number: int
    region: str
    start: int
    """First National Dex number in this generation, inclusive."""
    end: int
    """Last National Dex number in this generation, inclusive."""


GENERATIONS: list[Generation] = [
    Generation(1, "Kanto", 1, 151),
    Generation(2, "Johto", 152, 251),
    Generation(3, "Hoenn", 252, 386),
    Generation(4, "Sinnoh", 387, 493),
    Generation(5, "Unova", 494, 649),
    Generation(6, "Kalos", 650, 721),
    Generation(7, "Alola", 722, 809),
    Generation(8, "Galar", 810, 905),
    Generation(9, "Paldea", 906, 1025),
]


def dex_range_for_generation(generation: int) -> tuple[int, int] | None:
    """None for an out-of-range generation number — callers treat that the
    same as "no filter" rather than raising, since it's just an unknown/future
    generation, not a malformed request."""
    return next(((g.start, g.end) for g in GENERATIONS if g.number == generation), None)
