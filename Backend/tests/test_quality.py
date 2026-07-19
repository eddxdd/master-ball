"""Unit tests for post-generation quality guards (app/agent/quality.py)."""

from app.agent.quality import apply_quality_guards
from app.schemas.rag import RetrievedChunk


def _chunk(n: int) -> RetrievedChunk:
    return RetrievedChunk(
        source_id=f"src-{n}",
        title=f"Doc {n}",
        content=f"body {n}",
        score=0.9,
        url=None,
    )


def test_strips_invalid_citation_markers():
    citations = [_chunk(1)]
    result = apply_quality_guards(
        "See [1] and also [9] for details.",
        citations,
        tools_used={"retrieve_context"},
    )
    assert "[9]" not in result.answer
    assert "[1]" in result.answer
    assert len(result.citations) == 1
    assert "invalid_citation_markers" in result.warnings


def test_keeps_markers_when_retrieval_returned_nothing():
    result = apply_quality_guards(
        "See [1] for details.",
        [],
        tools_used={"retrieve_context"},
    )
    assert "[1]" in result.answer
    assert "citation_markers_without_retrieval" in result.warnings


def test_ungrounded_damage_claim_adds_disclaimer():
    result = apply_quality_guards(
        "This move is an OHKO into the standard set.",
        [],
        tools_used={"get_pokemon_profile"},
    )
    assert "ungrounded_damage_claim" in result.warnings
    assert "no damage calculation tool ran" in result.answer.lower()


def test_damage_claim_ok_when_calc_ran():
    result = apply_quality_guards(
        "Calc shows a 56% chance to OHKO.",
        [],
        tools_used={"calculate_damage"},
    )
    assert "ungrounded_damage_claim" not in result.warnings
    assert "Quality note" not in result.answer
