"""suggest_teammates — Phase 6's GraphRAG-style teammate-suggestion tool: a
multi-hop Neo4j traversal combining two already-real data sources, recombined
into a graph shape by scripts/load_graph.py — the type chart (which types
"resist" the current team's weaknesses) and real Smogon-usage-derived
teammate co-occurrence (`PAIRS_WITH`, from Phase 5's synced usage stats) —
into one ranked candidate list with plain-English, graph-edge-traceable
reasons. Deliberately not a single flat SQL query: "which Pokemon both
resist my team's weaknesses AND are commonly played alongside my current
team" is a natural multi-hop graph question that's more readable as two
short traversals than as several nested SQL subqueries — see
Docs/roadmap.md's Phase 6 section for the full design note on when GraphRAG
earns its keep over a plain relational join.
"""

from app.graph.session import run_query
from app.schemas.graph import TeammateCandidate, TeamSuggestionResult, TeamWeakness

SUPER_EFFECTIVE_THRESHOLD = 2.0
RESIST_THRESHOLD = 0.5
RESIST_BONUS = 15.0
"""How many synergy-score "usage points" a single weakness-resist is worth —
calibrated so a resist-only candidate (no usage-stats teammate data at all,
e.g. a niche pick) can still surface, without letting resists alone always
outrank a real double-digit-percent usage-stats teammate pairing."""
MAX_CANDIDATES = 8


async def _team_weaknesses(team_ids: list[str]) -> list[TeamWeakness]:
    rows = await run_query(
        """
        MATCH (p:Pokemon)-[:HAS_TYPE]->(pt:Type)
        WHERE p.id IN $team_ids
        MATCH (attacker:Type)-[r:EFFECTIVE_AGAINST]->(pt)
        WHERE r.multiplier >= $threshold
        RETURN attacker.name AS type, count(DISTINCT p.id) AS weak_member_count
        ORDER BY weak_member_count DESC, type
        """,
        team_ids=team_ids,
        threshold=SUPER_EFFECTIVE_THRESHOLD,
    )
    return [
        TeamWeakness(type=row["type"], weak_member_count=row["weak_member_count"]) for row in rows
    ]


async def _resist_candidates(weak_types: list[str], team_ids: list[str]) -> dict[str, dict]:
    if not weak_types:
        return {}
    rows = await run_query(
        """
        MATCH (weak:Type)-[r:EFFECTIVE_AGAINST]->(resist_type:Type)
        WHERE weak.name IN $weak_types AND r.multiplier <= $threshold
        MATCH (candidate:Pokemon)-[:HAS_TYPE]->(resist_type)
        WHERE NOT candidate.id IN $team_ids
        RETURN candidate.id AS species_id, candidate.name AS name,
               collect(DISTINCT weak.name) AS resists
        """,
        weak_types=weak_types,
        team_ids=team_ids,
        threshold=RESIST_THRESHOLD,
    )
    return {row["species_id"]: row for row in rows}


async def _teammate_candidates(team_ids: list[str]) -> dict[str, dict]:
    rows = await run_query(
        """
        MATCH (member:Pokemon)-[r:PAIRS_WITH]->(candidate:Pokemon)
        WHERE member.id IN $team_ids AND NOT candidate.id IN $team_ids
        RETURN candidate.id AS species_id, candidate.name AS name,
               sum(r.percent) AS synergy_score, collect(DISTINCT member.name) AS pairs_with
        """,
        team_ids=team_ids,
    )
    return {row["species_id"]: row for row in rows}


async def suggest_teammates(team_species_ids: list[str]) -> TeamSuggestionResult:
    """`team_species_ids` should be the 1-5 current team members (a full
    6-member team has no open slot to suggest into, though this degrades
    gracefully rather than erroring either way). Returns an empty candidate
    list — not an error — if the graph has no usage/resist matches (e.g. an
    empty team, or a team of Pokemon with no synced usage-stats teammates and
    no exploitable type weaknesses)."""
    if not team_species_ids:
        return TeamSuggestionResult(team_weaknesses=[], candidates=[])

    weaknesses = await _team_weaknesses(team_species_ids)
    weak_types = [w.type for w in weaknesses]

    resist_map = await _resist_candidates(weak_types, team_species_ids)
    teammate_map = await _teammate_candidates(team_species_ids)

    scored: dict[str, TeammateCandidate] = {}
    for species_id, row in teammate_map.items():
        scored[species_id] = TeammateCandidate(
            species_id=species_id,
            species_name=row["name"],
            score=round(row["synergy_score"], 2),
            reasons=[
                f"Commonly paired with {mate} on real ladder teams" for mate in row["pairs_with"]
            ],
        )
    for species_id, row in resist_map.items():
        resists = row["resists"]
        bonus = RESIST_BONUS * len(resists)
        reason = f"Resists {', '.join(resists)}, which your team is weak to"
        if species_id in scored:
            scored[species_id].score = round(scored[species_id].score + bonus, 2)
            scored[species_id].reasons.append(reason)
        else:
            scored[species_id] = TeammateCandidate(
                species_id=species_id,
                species_name=row["name"],
                score=round(bonus, 2),
                reasons=[reason],
            )

    candidates = sorted(scored.values(), key=lambda c: c.score, reverse=True)[:MAX_CANDIDATES]
    return TeamSuggestionResult(team_weaknesses=weaknesses, candidates=candidates)
