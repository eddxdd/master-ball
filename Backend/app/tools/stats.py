"""The official Pokemon stat and stat-stage formulas — shared by the damage
calculator and (once it exists) the team analyzer's speed-tier computation."""


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


def apply_stat_stage(value: float, stage: int) -> float:
    """+1 stage = x1.5 (well, x(2+1)/2), -1 stage = x(2/3), clamped to ±6."""
    stage = max(-6, min(6, stage))
    if stage >= 0:
        return value * (2 + stage) / 2
    return value * 2 / (2 - stage)
