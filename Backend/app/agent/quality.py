"""Post-generation quality guards — citation integrity + ungrounded damage claims.

These run *before* the user sees a final answer. They are not a general
hallucination detector; they enforce product-specific rules that match how
Master Ball is supposed to work: numbers come from tools, citations must
point at real retrieved chunks.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.schemas.rag import RetrievedChunk

logger = logging.getLogger("masterball.quality")

# Citation markers the synthesizer is instructed to emit: [1], [2], …
_CITATION_RE = re.compile(r"\[(\d+)\]")

# Numeric damage / KO claims that should only appear when calculate_damage ran.
_DAMAGE_CLAIM_RE = re.compile(
    r"(?:"
    r"\b(?:OHKO|2HKO|3HKO|4HKO)\b"
    r"|\b\d{1,3}(?:\.\d+)?%\s*(?:chance\s+)?(?:to\s+)?(?:OHKO|2HKO|KO|kill)\b"
    r"|\b(?:deals?|does|for)\s+\d{1,5}\s*[-–]\s*\d{1,5}\s*(?:damage|hp)\b"
    r"|\b\d{1,5}\s*[-–]\s*\d{1,5}\s*(?:damage|hp)\b"
    r")",
    re.IGNORECASE,
)

_UNGROUNDED_NOTE = (
    "\n\n_Quality note: no damage calculation tool ran for this answer — "
    "treat any numeric damage or KO claims as unverified._"
)


@dataclass(frozen=True)
class QualityResult:
    answer: str
    citations: list[RetrievedChunk]
    warnings: list[str]


def apply_quality_guards(
    answer: str,
    citations: list[RetrievedChunk],
    tools_used: set[str],
) -> QualityResult:
    """Return a sanitized answer + citation list + warning codes."""
    warnings: list[str] = []
    cleaned_answer, cleaned_citations, citation_warnings = _enforce_citation_integrity(
        answer, citations
    )
    warnings.extend(citation_warnings)

    if "calculate_damage" not in tools_used and _DAMAGE_CLAIM_RE.search(cleaned_answer):
        warnings.append("ungrounded_damage_claim")
        if _UNGROUNDED_NOTE.strip() not in cleaned_answer:
            cleaned_answer = cleaned_answer.rstrip() + _UNGROUNDED_NOTE
        logger.warning("Ungrounded damage/KO claim detected; appended disclaimer")

    return QualityResult(
        answer=cleaned_answer, citations=cleaned_citations, warnings=warnings
    )


def _enforce_citation_integrity(
    answer: str, citations: list[RetrievedChunk]
) -> tuple[str, list[RetrievedChunk], list[str]]:
    """Keep only citations whose [n] markers appear; drop out-of-range markers.

    If the model cited something but retrieval returned zero chunks, leave the
    markers alone (warn only) — stripping would destroy grounded prose when
    the failure was on the retrieval side, not the citation syntax.
    """
    warnings: list[str] = []
    cited_indexes = {int(m) for m in _CITATION_RE.findall(answer)}
    if not cited_indexes:
        return answer, citations, warnings
    if not citations:
        warnings.append("citation_markers_without_retrieval")
        return answer, citations, warnings

    valid_indexes = {i for i in cited_indexes if 1 <= i <= len(citations)}
    invalid = cited_indexes - valid_indexes

    cleaned = answer
    if invalid:
        warnings.append("invalid_citation_markers")
        for idx in sorted(invalid, reverse=True):
            cleaned = cleaned.replace(f"[{idx}]", "")
        cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
        logger.warning("Stripped invalid citation markers: %s", sorted(invalid))

    kept = [citations[i - 1] for i in sorted(valid_indexes)]
    if len(kept) < len(citations):
        warnings.append("unused_citations_dropped")
    return cleaned, kept, warnings
