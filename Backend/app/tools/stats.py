"""The official Pokemon stat and stat-stage formulas — shared by the damage
calculator, the team analyzer's speed-tier computation, and the Pokedex's
min/max stat range display."""

MIN_MAX_LEVEL = 100
"""The level the Pokedex's min/max stat range table is computed at — this
project's competitive focus is standard (non-VGC) singles, where level 100 is
the norm; a level-50 column is a reasonable future addition but not required
for that scope."""

_HINDERING_NATURE = 0.9
_BENEFICIAL_NATURE = 1.1


def calculate_stat(
    base: int, iv: int, ev: int, level: int, *, is_hp: bool, nature_multiplier: float = 1.0
) -> int:
    """The standard Gen 3+ stat formula. `nature_multiplier` is ignored for HP
    (nature never affects HP)."""
    core = (2 * base + iv + ev // 4) * level // 100
    if is_hp:
        if base == 1:
            # Shedinja's signature quirk: base HP of 1 always means exactly 1
            # HP, regardless of level/IVs — a real, well-known exception, not
            # a bug, worth handling explicitly rather than silently wrong.
            return 1
        return core + level + 10
    return int((core + 5) * nature_multiplier)


def min_max_stats(base_stats: dict[str, int], level: int = MIN_MAX_LEVEL) -> tuple[dict, dict]:
    """The theoretical floor/ceiling for each stat — the standard "stat range"
    table every real Pokedex tool (Bulbapedia, Serebii, Smogon's own calc)
    shows: min = 0 IV/0 EV plus a hindering nature, max = 31 IV/252 EV plus a
    beneficial nature, both at `level`. This is per-stat and hypothetical (no
    single nature actually hinders *and* boosts every stat at once) — that's
    the same convention those reference sites use, not a bug. HP ignores the
    nature multiplier entirely, matching `calculate_stat`.
    """
    minimum: dict[str, int] = {}
    maximum: dict[str, int] = {}
    for key, base in base_stats.items():
        is_hp = key == "hp"
        minimum[key] = calculate_stat(
            base, iv=0, ev=0, level=level, is_hp=is_hp, nature_multiplier=_HINDERING_NATURE
        )
        maximum[key] = calculate_stat(
            base, iv=31, ev=252, level=level, is_hp=is_hp, nature_multiplier=_BENEFICIAL_NATURE
        )
    return minimum, maximum


def apply_stat_stage(value: float, stage: int) -> float:
    """+1 stage = x1.5 (well, x(2+1)/2), -1 stage = x(2/3), clamped to ±6."""
    stage = max(-6, min(6, stage))
    if stage >= 0:
        return value * (2 + stage) / 2
    return value * 2 / (2 - stage)
