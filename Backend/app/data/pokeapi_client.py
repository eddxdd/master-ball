"""Fetches real ability/move description text from PokeAPI (https://pokeapi.co),
the community-maintained REST API for Pokemon reference data that most
production Pokedex tools build on for exactly this — poke-env's bundled
Showdown data (see scripts/seed_pokedex.py) has ids/mechanics only, no
flavor/effect text.

This is intentionally the *only* place in the codebase that talks to
PokeAPI, and it only ever runs from the seed script (never at request time —
see Docs/backend/README.md's note on not hammering third-party APIs live).
Results are cached to disk (app/data/cache/*.json, committed to the repo) so
the idempotent seed script doesn't need network access — or PokeAPI's public,
rate-limited API — on every run. Pass refresh=True (or `--refresh-descriptions`
on the seed script) to re-fetch after a generation bump.

DO NOT replace this with a hand-typed dict "for now" — that's exactly the
cheap/temporary shortcut this module exists to avoid. If a description is
missing, it's because PokeAPI genuinely doesn't have it yet (very recent
DLC content), not because nobody got around to typing it.
"""

import asyncio
import json
from pathlib import Path

import httpx

POKEAPI_BASE = "https://pokeapi.co/api/v2"
CACHE_DIR = Path(__file__).parent / "cache"
CONCURRENT_REQUESTS = 8
REQUEST_TIMEOUT = 30.0

# The category boundary for "items worth having in this app": every PokeAPI
# item-category that can actually be held and do something in a Gen 9 singles
# battle. Deliberately a *category* allowlist, not a hand-picked item list —
# every item within an included category is taken, none are cherry-picked.
# Excludes Poke Balls, actual medicine (Potions/Full Restores — PokeAPI's
# "healing" category) and vitamins/candies (PokeAPI's "vitamins" category),
# key items, TMs, mail, evolution stones (consumed, not held), Mints
# (consumed), and mechanics this app doesn't model (Z-Crystals, Dynamax
# Crystals, Tera Shards — the last is an SV overworld currency item, not a
# held battle item despite the name).
#
# "medicine" is *not* one of the excluded consumable categories despite the
# name — confusingly, PokeAPI files real potions/vitamins under "healing"/
# "vitamins" instead, and "medicine" turns out to hold exactly the ten
# status/HP-restoring berries (Lum, Sitrus, Oran, Chesto, ...) that *are*
# real, commonly-held competitive items (Lum Berry and Sitrus Berry
# especially). Omitting it was a real seeding gap, not an intentional
# exclusion — every one of these showed up as an unresolvable raw Showdown
# id ("lumberry") in the Ladder Usage card and usage-stats tool output
# rather than a real name, since Smogon's own usage-stats data only ever
# gives moves/items/abilities as ids, never display text (unlike
# teammates/checks) — see app/tools/meta_stats.py's `lookup_meta_stats` for
# where that resolution actually happens.
ITEM_CATEGORIES = [
    "held-items",
    "choice",
    "bad-held-items",
    "plates",
    "species-specific",
    "type-enhancement",
    "mega-stones",
    "memories",
    "in-a-pinch",
    "type-protection",
    "picky-healing",
    "jewels",
    "medicine",
    # PokeAPI's catch-all "misc" bucket for anything that didn't fit its
    # other categories — normally too noisy to blanket-include, but as of
    # this writing it holds exactly five items, all real retaliation
    # berries (Enigma/Jaboca/Rowap/Kee/Maranga Berry) with no junk mixed
    # in, so it's safe to take wholesale rather than needing a per-item
    # allowlist just for these five.
    "other",
]


def _to_showdown_id(pokeapi_slug: str) -> str:
    """PokeAPI slugs are kebab-case (`"clear-body"`, `"u-turn"`); Showdown/
    poke-env ids are the same name with every separator stripped
    (`"clearbody"`, `"uturn"`). Stripping hyphens reliably reconstructs the
    Showdown id since a hyphen is the only non-alphanumeric character PokeAPI
    slugs use."""
    return pokeapi_slug.replace("-", "")


def _clean(text: str) -> str:
    return " ".join(text.split())


def _english_effect(entries: list[dict]) -> str | None:
    for entry in entries:
        if entry["language"]["name"] == "en":
            text = entry.get("short_effect") or entry.get("effect")
            return _clean(text) if text else None
    return None


def _english_flavor_text(entries: list[dict], *, text_key: str = "flavor_text") -> str | None:
    # Later entries are newer version groups; walk backwards for the most
    # up-to-date wording. Moves/abilities use "flavor_text"; items
    # inexplicably use a plain "text" key for the same concept.
    for entry in reversed(entries):
        if entry["language"]["name"] == "en":
            return _clean(entry[text_key])
    return None


def _english_name(names: list[dict]) -> str | None:
    for entry in names:
        if entry["language"]["name"] == "en":
            return entry["name"]
    return None


async def _fetch_resource_names(client: httpx.AsyncClient, resource: str) -> list[str]:
    response = await client.get(f"{POKEAPI_BASE}/{resource}", params={"limit": 2000})
    response.raise_for_status()
    return [entry["name"] for entry in response.json()["results"]]


async def _fetch_one_description(
    client: httpx.AsyncClient, resource: str, slug: str, semaphore: asyncio.Semaphore
) -> tuple[str, str | None]:
    async with semaphore:
        response = await client.get(f"{POKEAPI_BASE}/{resource}/{slug}")
        response.raise_for_status()
        data = response.json()

    description = _english_effect(data.get("effect_entries", []))
    if description is None:
        description = _english_flavor_text(data.get("flavor_text_entries", []))
    return _to_showdown_id(slug), description


async def _fetch_all_descriptions(resource: str) -> dict[str, str]:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        slugs = await _fetch_resource_names(client, resource)
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        results = await asyncio.gather(
            *(_fetch_one_description(client, resource, slug, semaphore) for slug in slugs)
        )
    return {showdown_id: description for showdown_id, description in results if description}


async def _get_cached_descriptions(
    resource: str, cache_filename: str, *, refresh: bool
) -> dict[str, str]:
    cache_path = CACHE_DIR / cache_filename
    if not refresh and cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    print(f"  fetching {resource} descriptions from PokeAPI (cached to {cache_path.name})...")
    descriptions = await _fetch_all_descriptions(resource)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(descriptions, indent=2, sort_keys=True), encoding="utf-8")
    return descriptions


async def get_ability_descriptions(*, refresh: bool = False) -> dict[str, str]:
    """Showdown ability id -> real effect description, e.g.
    `"intimidate" -> "Lowers opponents' Attack one stage upon entering battle."`"""
    return await _get_cached_descriptions("ability", "ability_descriptions.json", refresh=refresh)


async def get_move_descriptions(*, refresh: bool = False) -> dict[str, str]:
    """Showdown move id -> real effect description."""
    return await _get_cached_descriptions("move", "move_descriptions.json", refresh=refresh)


async def _fetch_category_slugs(client: httpx.AsyncClient, category: str) -> list[tuple[str, str]]:
    """Returns `(item_slug, category)` pairs for every item in a category."""
    response = await client.get(f"{POKEAPI_BASE}/item-category/{category}")
    response.raise_for_status()
    return [(entry["name"], category) for entry in response.json()["items"]]


SPRITES_REPO_RAW = "https://raw.githubusercontent.com/PokeAPI/sprites/master"

# Generation-versioned subfolders to check (newest first — the items this
# actually matters for skew recent) when an item's own `sprites.default` is
# null. PokeAPI's `item/{id}` endpoint's `sprites.default` field only ever
# points at a flat `sprites/items/<slug>.png` file — but the *same* sprites
# repo backing that field also holds generation-versioned icons (e.g.
# `sprites/items/gen9/booster-energy.png`) for a batch of real, competitively
# relevant Gen 8/9 items (Booster Energy, Heavy-Duty Boots, Covert Cloak,
# Loaded Dice, the Ogerpon masks, ...) that never got copied into that flat
# folder, so the API's own `default` field is null for them even though real
# artwork exists one directory over. Checked via a real HEAD request (not
# assumed) since a genuine data gap — e.g. Blank Plate, Legend Plate — should
# still end up `None`, not a guessed 404 URL.
#
# IMPORTANT: this fallback is *display-only*. Unlike the flat directory,
# these per-generation folders turn out to also carry community fan art for
# non-canonical "CAP" mega stones that were never actually released (e.g.
# "Raichunite X" — see scripts/seed_pokedex.py's `_is_fabricated_mega`,
# which relies on "has a real PokeAPI sprite" to detect exactly those). So
# `_fetch_one_item` reports *both* this fallback-inclusive `sprite_url` (for
# display) and the original flat-only presence as `official_sprite` (for
# that fabrication check) — never conflate the two.
_ITEM_SPRITE_FALLBACK_DIRS = ["gen9", "gen8"]


async def _fallback_item_sprite_url(
    client: httpx.AsyncClient, slug: str, semaphore: asyncio.Semaphore
) -> str | None:
    for directory in _ITEM_SPRITE_FALLBACK_DIRS:
        url = f"{SPRITES_REPO_RAW}/sprites/items/{directory}/{slug}.png"
        async with semaphore:
            response = await client.head(url, follow_redirects=True)
        if response.status_code == 200:
            return url
    return None


async def _fetch_one_item(
    client: httpx.AsyncClient, slug: str, category: str, semaphore: asyncio.Semaphore
) -> tuple[str, dict | None]:
    async with semaphore:
        response = await client.get(f"{POKEAPI_BASE}/item/{slug}")
        if response.status_code == 404:
            # A handful of `mega-stones` entries (e.g. "clefablite") are listed
            # in the category but 404 on their own detail endpoint — stale/
            # non-canonical entries in PokeAPI's own data, not something we
            # can fetch real data for. Skip rather than crash the whole seed,
            # same "gracefully handle missing" precedent as sprite 404s below.
            return _to_showdown_id(slug), None
        response.raise_for_status()
        data = response.json()

    description = _english_effect(data.get("effect_entries", []))
    if description is None:
        description = _english_flavor_text(data.get("flavor_text_entries", []), text_key="text")
    sprites = data.get("sprites") or {}

    official_sprite_url = sprites.get("default")
    sprite_url = official_sprite_url
    if sprite_url is None:
        sprite_url = await _fallback_item_sprite_url(client, slug, semaphore)

    record = {
        "name": _english_name(data.get("names", [])) or slug.replace("-", " ").title(),
        "description": description,
        "category": category,
        "fling_power": data.get("fling_power"),
        "sprite_url": sprite_url,
        # True only for PokeAPI's own flat-directory sprite, not the
        # generation-versioned fallback above — see
        # `_ITEM_SPRITE_FALLBACK_DIRS`'s docstring for why this, not
        # `sprite_url` itself, is the right "is this a real, released item"
        # signal for `_is_fabricated_mega` in scripts/seed_pokedex.py to use.
        "official_sprite": official_sprite_url is not None,
    }
    return _to_showdown_id(slug), record


async def _fetch_all_items() -> dict[str, dict]:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        category_results = await asyncio.gather(
            *(_fetch_category_slugs(client, category) for category in ITEM_CATEGORIES)
        )
        # Some items could theoretically live in more than one allowlisted
        # category (e.g. a future overlap) — dedupe by slug, first category
        # listed in ITEM_CATEGORIES wins, so order above is meaningful.
        slug_to_category: dict[str, str] = {}
        for pairs in category_results:
            for slug, category in pairs:
                slug_to_category.setdefault(slug, category)

        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        results = await asyncio.gather(
            *(
                _fetch_one_item(client, slug, category, semaphore)
                for slug, category in slug_to_category.items()
            )
        )
    skipped = [showdown_id for showdown_id, record in results if record is None]
    if skipped:
        print(f"    skipped {len(skipped)} item(s) with no PokeAPI detail data: {skipped}")
    return {showdown_id: record for showdown_id, record in results if record is not None}


def _english_genus(genera: list[dict]) -> str | None:
    """PokeAPI's category line, e.g. Empoleon -> \"Emperor Pokémon\"."""
    for entry in genera:
        if entry["language"]["name"] == "en":
            text = entry.get("genus")
            return _clean(text) if text else None
    return None


async def _fetch_one_species_meta(
    client: httpx.AsyncClient, slug: str, semaphore: asyncio.Semaphore
) -> tuple[str, str | None, str | None]:
    """One species hit yields both flavor text and the English genus so we
    never walk the full pokemon-species list twice."""
    async with semaphore:
        response = await client.get(f"{POKEAPI_BASE}/pokemon-species/{slug}")
        response.raise_for_status()
        data = response.json()
    return (
        _to_showdown_id(slug),
        _english_flavor_text(data.get("flavor_text_entries", [])),
        _english_genus(data.get("genera", [])),
    )


async def _fetch_all_species_meta() -> tuple[dict[str, str], dict[str, str]]:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        slugs = await _fetch_resource_names(client, "pokemon-species")
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        results = await asyncio.gather(
            *(_fetch_one_species_meta(client, slug, semaphore) for slug in slugs)
        )
    descriptions = {
        showdown_id: description
        for showdown_id, description, _genus in results
        if description
    }
    genera = {
        showdown_id: genus for showdown_id, _description, genus in results if genus
    }
    return descriptions, genera


async def _ensure_species_text_caches(
    *, refresh: bool = False
) -> tuple[dict[str, str], dict[str, str]]:
    """Shared loader for flavor text + genus caches. One PokeAPI walk writes
    both files so a missing genera cache doesn't force a second full crawl
    later — and `--refresh-descriptions` refreshes both together."""
    desc_path = CACHE_DIR / "pokemon_descriptions.json"
    genus_path = CACHE_DIR / "pokemon_genera.json"
    if not refresh and desc_path.exists() and genus_path.exists():
        return (
            json.loads(desc_path.read_text(encoding="utf-8")),
            json.loads(genus_path.read_text(encoding="utf-8")),
        )

    print(
        "  fetching Pokemon descriptions + genera from PokeAPI "
        f"(cached to {desc_path.name}, {genus_path.name})..."
    )
    descriptions, genera = await _fetch_all_species_meta()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    desc_path.write_text(json.dumps(descriptions, indent=2, sort_keys=True), encoding="utf-8")
    genus_path.write_text(json.dumps(genera, indent=2, sort_keys=True), encoding="utf-8")
    return descriptions, genera


async def get_pokemon_descriptions(*, refresh: bool = False) -> dict[str, str]:
    """Showdown *base*-species id -> real Pokedex flavor text, e.g.
    `"charizard" -> "It is said that Charizard's fire burns hotter if it has
    experienced harsh battles."` Keyed by base species only — PokeAPI's
    `pokemon-species` resource has one entry per species, not per battle-only
    forme, so Mega Evolution/Gigantamax/most regional forme rows all share
    their base species' entry; `seed_pokedex.py` looks this up via each row's
    own `base_species` (falling back to its own id for species that aren't a
    forme) so every row still gets real flavor text, not a missing one."""
    descriptions, _genera = await _ensure_species_text_caches(refresh=refresh)
    return descriptions


async def get_pokemon_genera(*, refresh: bool = False) -> dict[str, str]:
    """Showdown *base*-species id -> Pokedex category / genus, e.g.
    `"empoleon" -> "Emperor Pokémon"`. Same keying rules as
    `get_pokemon_descriptions` (shared by formes via base species)."""
    _descriptions, genera = await _ensure_species_text_caches(refresh=refresh)
    return genera


async def get_items(*, refresh: bool = False) -> dict[str, dict]:
    """Showdown item id -> `{name, description, category, fling_power,
    sprite_url}` for every battle-relevant held item (see `ITEM_CATEGORIES`).
    poke-env has no item data at all, so unlike ability/move descriptions this
    is the *only* source for items in this codebase, not just their text."""
    cache_path = CACHE_DIR / "items.json"
    if not refresh and cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    print(f"  fetching items from PokeAPI (cached to {cache_path.name})...")
    items = await _fetch_all_items()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(items, indent=2, sort_keys=True), encoding="utf-8")
    return items
