"""Team-level feature engineering for Phase 7's win-probability toy model
(app/tools/win_probability.py, scripts/train_win_probability_model.py). Every
number here is computed from real seeded Pokedex data (Species base stats +
the real type chart, the same tables app/tools/team_analysis.py already
trusts) — this module only decides which per-team summary statistics are
worth handing to the model, it never fabricates an input.

Deliberately a small, interpretable feature set (10 numbers per team) rather
than one-hot-encoding every possible species/type/move — a toy model trained
on ~20k synthetic samples (see app/ml/simulate.py) would badly overfit a
much higher-dimensional input; team-level aggregates are also what a human
would actually reason about ("this team is faster/bulkier/more diverse"),
which keeps the served `*_features` breakdown genuinely explainable.
"""

from app.models.pokemon import Species
from app.tools.type_chart import compute_matchups

FEATURE_NAMES = [
    "avg_hp",
    "avg_atk",
    "avg_def",
    "avg_spa",
    "avg_spd",
    "avg_spe",
    "type_diversity",
    "avg_weak_count",
    "avg_resist_count",
    "team_size",
]

SUPER_EFFECTIVE_THRESHOLD = 2.0
RESIST_THRESHOLD = 0.5


def team_feature_vector(
    members: list[Species], type_chart: dict[tuple[str, str], float]
) -> list[float]:
    """`members` should be real Species rows for a team's 1-6 Pokemon.
    An empty team returns an all-zero vector rather than raising, so callers
    (e.g. the frontend's "opponent team not filled in yet" state) don't need
    a separate empty-team branch."""
    if not members:
        return [0.0] * len(FEATURE_NAMES)

    n = len(members)
    avg_hp = sum(s.base_stats["hp"] for s in members) / n
    avg_atk = sum(s.base_stats["atk"] for s in members) / n
    avg_def = sum(s.base_stats["def"] for s in members) / n
    avg_spa = sum(s.base_stats["spa"] for s in members) / n
    avg_spd = sum(s.base_stats["spd"] for s in members) / n
    avg_spe = sum(s.base_stats["spe"] for s in members) / n

    team_types = {s.type1 for s in members} | {s.type2 for s in members if s.type2}
    type_diversity = float(len(team_types))

    weak_counts = []
    resist_counts = []
    for s in members:
        matchups = compute_matchups(s.type1, s.type2, type_chart)
        weak_counts.append(sum(1 for m in matchups.values() if m >= SUPER_EFFECTIVE_THRESHOLD))
        resist_counts.append(sum(1 for m in matchups.values() if 0 < m <= RESIST_THRESHOLD))
    avg_weak_count = sum(weak_counts) / n
    avg_resist_count = sum(resist_counts) / n

    return [
        avg_hp,
        avg_atk,
        avg_def,
        avg_spa,
        avg_spd,
        avg_spe,
        type_diversity,
        avg_weak_count,
        avg_resist_count,
        float(n),
    ]


def combined_feature_names() -> list[str]:
    return [f"team_a_{name}" for name in FEATURE_NAMES] + [
        f"team_b_{name}" for name in FEATURE_NAMES
    ]


def combine_features(features_a: list[float], features_b: list[float]) -> list[float]:
    return [*features_a, *features_b]


FEATURE_COUNT = len(FEATURE_NAMES) * 2

__all__ = [
    "FEATURE_COUNT",
    "FEATURE_NAMES",
    "combine_features",
    "combined_feature_names",
    "team_feature_vector",
]
