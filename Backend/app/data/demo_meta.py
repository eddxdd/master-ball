"""Local-demo Gen 9 OU leaderboard filler.

Used by `lookup_meta_leaderboard` when `usage_stats` has no rows for
`gen9ou` yet (Smogon sync hasn't been run). Numbers are plausible ladder
shares for the classic OU pillars — not a live Smogon dump. Once
`scripts.sync_usage_stats` has written real rows, this module is unused.
"""

from __future__ import annotations

from typing import TypedDict


class DemoShare(TypedDict):
    name: str
    percent: float


class DemoLeaderboardRow(TypedDict):
    species_id: str
    species_name: str
    rank: int
    usage_percent: float
    raw_count: int
    moves: list[DemoShare]
    items: list[DemoShare]


DEMO_META_MONTH = "2026-05"

# Ordered by usage — keep species_ids aligned with the Gen 9 seed / knowledge KB.
DEMO_GEN9OU_LEADERBOARD: list[DemoLeaderboardRow] = [
    {
        "species_id": "greattusk",
        "species_name": "Great Tusk",
        "rank": 1,
        "usage_percent": 18.42,
        "raw_count": 168_400,
        "moves": [
            {"name": "headlongrush", "percent": 74.2},
            {"name": "icespinner", "percent": 61.8},
            {"name": "rapidspin", "percent": 58.1},
            {"name": "knockoff", "percent": 52.4},
        ],
        "items": [
            {"name": "leftovers", "percent": 36.5},
            {"name": "boosterenergy", "percent": 28.1},
            {"name": "assaultvest", "percent": 14.2},
        ],
    },
    {
        "species_id": "kingambit",
        "species_name": "Kingambit",
        "rank": 2,
        "usage_percent": 16.88,
        "raw_count": 154_200,
        "moves": [
            {"name": "swordsdance", "percent": 71.5},
            {"name": "kowtowcleave", "percent": 88.2},
            {"name": "suckerpunch", "percent": 79.4},
            {"name": "ironhead", "percent": 64.0},
        ],
        "items": [
            {"name": "blackglasses", "percent": 42.0},
            {"name": "leftovers", "percent": 24.8},
            {"name": "lifeorb", "percent": 16.3},
        ],
    },
    {
        "species_id": "gholdengo",
        "species_name": "Gholdengo",
        "rank": 3,
        "usage_percent": 14.55,
        "raw_count": 132_900,
        "moves": [
            {"name": "nastyplot", "percent": 68.9},
            {"name": "shadowball", "percent": 91.2},
            {"name": "makeitrain", "percent": 86.4},
            {"name": "focusblast", "percent": 41.7},
        ],
        "items": [
            {"name": "choicespecs", "percent": 33.1},
            {"name": "lifeorb", "percent": 29.4},
            {"name": "leftovers", "percent": 18.6},
        ],
    },
    {
        "species_id": "dragapult",
        "species_name": "Dragapult",
        "rank": 4,
        "usage_percent": 12.91,
        "raw_count": 117_800,
        "moves": [
            {"name": "dragondarts", "percent": 72.0},
            {"name": "shadowball", "percent": 58.3},
            {"name": "uturn", "percent": 61.5},
            {"name": "thunderbolt", "percent": 34.2},
        ],
        "items": [
            {"name": "choicespecs", "percent": 31.8},
            {"name": "heavydutyboots", "percent": 27.4},
            {"name": "lifeorb", "percent": 19.1},
        ],
    },
    {
        "species_id": "ironvaliant",
        "species_name": "Iron Valiant",
        "rank": 5,
        "usage_percent": 11.37,
        "raw_count": 103_900,
        "moves": [
            {"name": "swordsdance", "percent": 48.2},
            {"name": "closecombat", "percent": 71.6},
            {"name": "moonblast", "percent": 64.8},
            {"name": "knockoff", "percent": 52.1},
        ],
        "items": [
            {"name": "boosterenergy", "percent": 54.3},
            {"name": "lifeorb", "percent": 22.7},
            {"name": "focussash", "percent": 11.4},
        ],
    },
    {
        "species_id": "landorustherian",
        "species_name": "Landorus-Therian",
        "rank": 6,
        "usage_percent": 10.24,
        "raw_count": 93_500,
        "moves": [
            {"name": "earthquake", "percent": 88.6},
            {"name": "uturn", "percent": 76.2},
            {"name": "stealthrock", "percent": 61.4},
            {"name": "stoneedge", "percent": 48.9},
        ],
        "items": [
            {"name": "choicescarf", "percent": 38.7},
            {"name": "leftovers", "percent": 26.2},
            {"name": "rockyhelmet", "percent": 14.8},
        ],
    },
    {
        "species_id": "tinglu",
        "species_name": "Ting-Lu",
        "rank": 7,
        "usage_percent": 9.18,
        "raw_count": 83_800,
        "moves": [
            {"name": "earthquake", "percent": 82.4},
            {"name": "ruination", "percent": 71.1},
            {"name": "stealthrock", "percent": 66.8},
            {"name": "whirlwind", "percent": 44.2},
        ],
        "items": [
            {"name": "leftovers", "percent": 61.3},
            {"name": "rockyhelmet", "percent": 18.9},
            {"name": "heavydutyboots", "percent": 9.4},
        ],
    },
    {
        "species_id": "garganacl",
        "species_name": "Garganacl",
        "rank": 8,
        "usage_percent": 8.05,
        "raw_count": 73_500,
        "moves": [
            {"name": "saltcure", "percent": 94.1},
            {"name": "recover", "percent": 78.6},
            {"name": "protect", "percent": 62.3},
            {"name": "stoneedge", "percent": 41.8},
        ],
        "items": [
            {"name": "leftovers", "percent": 72.4},
            {"name": "rockyhelmet", "percent": 12.1},
            {"name": "custapberry", "percent": 6.8},
        ],
    },
    {
        "species_id": "corviknight",
        "species_name": "Corviknight",
        "rank": 9,
        "usage_percent": 7.42,
        "raw_count": 67_700,
        "moves": [
            {"name": "bravebird", "percent": 54.8},
            {"name": "defog", "percent": 68.2},
            {"name": "roost", "percent": 81.5},
            {"name": "uturn", "percent": 49.3},
        ],
        "items": [
            {"name": "leftovers", "percent": 58.6},
            {"name": "rockyhelmet", "percent": 21.4},
            {"name": "heavydutyboots", "percent": 12.7},
        ],
    },
    {
        "species_id": "toxapex",
        "species_name": "Toxapex",
        "rank": 10,
        "usage_percent": 6.88,
        "raw_count": 62_800,
        "moves": [
            {"name": "toxic", "percent": 71.2},
            {"name": "recover", "percent": 84.6},
            {"name": "haze", "percent": 58.9},
            {"name": "scald", "percent": 62.4},
        ],
        "items": [
            {"name": "blacksludge", "percent": 64.8},
            {"name": "rockyhelmet", "percent": 18.2},
            {"name": "bindingband", "percent": 7.1},
        ],
    },
    {
        "species_id": "gliscor",
        "species_name": "Gliscor",
        "rank": 11,
        "usage_percent": 6.21,
        "raw_count": 56_700,
        "moves": [
            {"name": "earthquake", "percent": 76.4},
            {"name": "protect", "percent": 81.2},
            {"name": "knockoff", "percent": 58.6},
            {"name": "swordsdance", "percent": 34.8},
        ],
        "items": [
            {"name": "toxicorb", "percent": 88.4},
            {"name": "leftovers", "percent": 6.2},
            {"name": "yacheberry", "percent": 2.1},
        ],
    },
    {
        "species_id": "roaringmoon",
        "species_name": "Roaring Moon",
        "rank": 12,
        "usage_percent": 5.74,
        "raw_count": 52_400,
        "moves": [
            {"name": "dragondance", "percent": 72.8},
            {"name": "knockoff", "percent": 68.1},
            {"name": "earthquake", "percent": 61.4},
            {"name": "acrobatics", "percent": 48.9},
        ],
        "items": [
            {"name": "boosterenergy", "percent": 61.2},
            {"name": "lifeorb", "percent": 18.6},
            {"name": "leftovers", "percent": 8.4},
        ],
    },
    {
        "species_id": "ragingbolt",
        "species_name": "Raging Bolt",
        "rank": 13,
        "usage_percent": 5.31,
        "raw_count": 48_500,
        "moves": [
            {"name": "thunderclap", "percent": 78.4},
            {"name": "dragonpulse", "percent": 71.2},
            {"name": "calmmind", "percent": 54.6},
            {"name": "thunderbolt", "percent": 48.1},
        ],
        "items": [
            {"name": "leftovers", "percent": 36.8},
            {"name": "lifeorb", "percent": 24.2},
            {"name": "choicespecs", "percent": 18.9},
        ],
    },
    {
        "species_id": "pecharunt",
        "species_name": "Pecharunt",
        "rank": 14,
        "usage_percent": 4.86,
        "raw_count": 44_300,
        "moves": [
            {"name": "malignantchain", "percent": 82.1},
            {"name": "partingshot", "percent": 64.8},
            {"name": "hex", "percent": 41.2},
            {"name": "shadowball", "percent": 38.6},
        ],
        "items": [
            {"name": "heavydutyboots", "percent": 42.4},
            {"name": "leftovers", "percent": 28.1},
            {"name": "blacksludge", "percent": 14.6},
        ],
    },
    {
        "species_id": "zapdos",
        "species_name": "Zapdos",
        "rank": 15,
        "usage_percent": 4.42,
        "raw_count": 40_300,
        "moves": [
            {"name": "hurricane", "percent": 68.4},
            {"name": "thunderbolt", "percent": 72.1},
            {"name": "uturn", "percent": 54.8},
            {"name": "roost", "percent": 61.2},
        ],
        "items": [
            {"name": "heavydutyboots", "percent": 71.6},
            {"name": "lifeorb", "percent": 12.4},
            {"name": "choicespecs", "percent": 8.2},
        ],
    },
]
