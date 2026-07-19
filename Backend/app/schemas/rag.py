"""Pydantic schemas for the RAG retrieval tool — see app/tools/retrieval.py."""

from pydantic import BaseModel


class RetrievedChunk(BaseModel):
    """One retrieved chunk plus enough citation metadata for a synthesized
    answer to link back to its source — see Docs/ai-agents-and-rag.md's
    "Grounding discipline" note."""

    source_id: str
    title: str
    url: str | None = None
    content: str
    species_id: str | None = None
    score: float
    """Cosine similarity in [-1, 1] (in practice ~[0, 1] for this embedding
    model) — higher is more relevant. Exposed so callers/tests can assert on
    ranking, not just presence."""


class RetrievalResult(BaseModel):
    query: str
    chunks: list[RetrievedChunk]
