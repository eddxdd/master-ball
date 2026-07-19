"""Phase 7's win-probability toy model needs *labeled* team-vs-team outcomes
to train on, and no dataset of real logged ladder match results (team
composition -> winner) is available to this project — building one would
mean either scraping Showdown replays at a scale far beyond Phase 5's
single-replay-at-a-time coach, or running a real self-play simulator (a
project of its own). Rather than fabricate random labels, this module
defines one transparent, documented synthetic "battle outcome" function —
built from real per-team feature statistics (app/ml/features.py: speed,
offense, bulk, type coverage) plus a real cross-team type-matchup advantage
term computed from the actual type chart — and samples a winner
probabilistically from it, with injected Gaussian noise standing in for
everything a 10-number team summary can't capture (exact movesets, player
skill, prediction, crit/damage-roll RNG).

scripts/train_win_probability_model.py trains XGBoost on the *raw* per-team
feature vectors, never on the intermediate diff/logit terms computed below —
so a nonzero validation AUC demonstrates the model recovered a real, hidden
nonlinear interaction purely from labeled outcomes. That's a genuine ML
engineering exercise (feature engineering + gradient-boosted trees + a
train/test split + a served artifact), not a claim that this predicts real
human ladder match outcomes. See Docs/backend/README.md's "Win probability
model (Phase 7)" section for the full, upfront caveat.
"""

import math
import random

from app.ml.features import FEATURE_NAMES
from app.models.pokemon import Species
from app.tools.type_chart import compute_matchups

SPEED_WEIGHT = 0.02
OFFENSE_WEIGHT = 0.015
BULK_WEIGHT = 0.01
COVERAGE_WEIGHT = 0.25
MATCHUP_WEIGHT = 1.5
NOISE_STD = 1.5
"""Standard deviation of the Gaussian noise added to the logit before
thresholding — deliberately large relative to the other terms so the
synthetic labels aren't a purely deterministic function of team stats (this
toy simulator has no model at all of movesets, switches, prediction, or
dice rolls, all of which meaningfully swing a real battle's outcome)."""

_FEATURE_INDEX = {name: i for i, name in enumerate(FEATURE_NAMES)}


def cross_type_matchup_advantage(
    team_a: list[Species], team_b: list[Species], type_chart: dict[tuple[str, str], float]
) -> float:
    """Real type-chart lookup, averaged over every (attacker, defender) pair
    across both teams: how much better team A's typing punishes team B's
    typing than the reverse. Deliberately simple (typing only, no
    movesets/abilities/items) — the precise, full weakness computation
    already lives in app/tools/team_analysis.py and isn't duplicated here;
    this is only a rough input to the synthetic label function."""
    if not team_a or not team_b:
        return 0.0

    def _avg_offense(attackers: list[Species], defenders: list[Species]) -> float:
        total = 0.0
        count = 0
        for attacker in attackers:
            attacker_types = [attacker.type1] + ([attacker.type2] if attacker.type2 else [])
            for defender in defenders:
                matchups = compute_matchups(defender.type1, defender.type2, type_chart)
                best = max(matchups[t] for t in attacker_types)
                total += best
                count += 1
        return total / count if count else 1.0

    return _avg_offense(team_a, team_b) - _avg_offense(team_b, team_a)


def simulate_outcome(
    features_a: list[float],
    features_b: list[float],
    matchup_advantage: float,
    rng: random.Random,
) -> int:
    """Returns 1 if team A wins, 0 otherwise — a single Bernoulli draw from
    the synthetic logit described in this module's docstring. `features_*`
    must be app/ml/features.py's FEATURE_NAMES-ordered vectors."""
    speed_diff = features_a[_FEATURE_INDEX["avg_spe"]] - features_b[_FEATURE_INDEX["avg_spe"]]
    offense_a = features_a[_FEATURE_INDEX["avg_atk"]] + features_a[_FEATURE_INDEX["avg_spa"]]
    offense_b = features_b[_FEATURE_INDEX["avg_atk"]] + features_b[_FEATURE_INDEX["avg_spa"]]
    bulk_a = (
        features_a[_FEATURE_INDEX["avg_hp"]]
        + features_a[_FEATURE_INDEX["avg_def"]]
        + features_a[_FEATURE_INDEX["avg_spd"]]
    )
    bulk_b = (
        features_b[_FEATURE_INDEX["avg_hp"]]
        + features_b[_FEATURE_INDEX["avg_def"]]
        + features_b[_FEATURE_INDEX["avg_spd"]]
    )
    coverage_diff = (
        features_a[_FEATURE_INDEX["type_diversity"]] - features_b[_FEATURE_INDEX["type_diversity"]]
    )

    logit = (
        SPEED_WEIGHT * speed_diff
        + OFFENSE_WEIGHT * (offense_a - offense_b)
        + BULK_WEIGHT * (bulk_a - bulk_b)
        + COVERAGE_WEIGHT * coverage_diff
        + MATCHUP_WEIGHT * matchup_advantage
        + rng.gauss(0, NOISE_STD)
    )
    probability = 1 / (1 + math.exp(-logit))
    return 1 if rng.random() < probability else 0


__all__ = ["cross_type_matchup_advantage", "simulate_outcome"]
