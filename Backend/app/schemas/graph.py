"""Pydantic schemas for Phase 6's GraphRAG teammate-suggestion tool — see
app/tools/graph_query.py.
"""

from pydantic import BaseModel


class TeamWeakness(BaseModel):
    """One type that's super-effective against at least one current team
    member, per a graph traversal of real HAS_TYPE/EFFECTIVE_AGAINST edges —
    not the full multi-type-stacking weakness matrix app/tools/team_analysis.py
    already computes precisely over Postgres; this is a simpler per-member
    count used only to rank teammate candidates, not a replacement for the
    Team Builder's own analysis."""

    type: str
    weak_member_count: int


class TeammateCandidate(BaseModel):
    species_id: str
    species_name: str
    score: float
    """A relative ranking score (real Smogon-usage co-occurrence percent
    points plus a fixed bonus per team weakness resisted) — not a
    probability or percentage itself, just a sort key. See
    app/tools/graph_query.py's RESIST_BONUS for the calibration note."""
    reasons: list[str]
    """Plain-English explanations traced directly back to the graph edges
    that produced this candidate (a real PAIRS_WITH usage percentage or a
    real EFFECTIVE_AGAINST resist), never a fabricated justification."""


class TeamSuggestionResult(BaseModel):
    team_weaknesses: list[TeamWeakness]
    candidates: list[TeammateCandidate]
