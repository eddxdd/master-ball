"""retrieve_context — the RAG tool: embeds a natural-language query, finds the
most similar chunks in pgvector's document_chunks table (via the HNSW cosine
index — see app/models/knowledge.py), and returns them with citation metadata.
See Docs/ai-agents-and-rag.md section 3.

Deterministic given a fixed embedding model and DB state (no LLM call here) —
the agent's synthesizer node is what turns these chunks into prose.
"""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import DocumentChunk
from app.schemas.rag import RetrievalResult, RetrievedChunk
from app.tools.embeddings import embed_query

DEFAULT_TOP_K = 4


async def retrieve_context(
    db: AsyncSession,
    query: str,
    top_k: int = DEFAULT_TOP_K,
    tags: list[str] | None = None,
) -> RetrievalResult:
    """`tags`, if given, restricts results to chunks whose doc_metadata.tags
    array contains at least one of the given tags (e.g. ["OU"]) — an optional
    coarse source filter, not a replacement for semantic ranking."""
    query_vector = embed_query(query)
    distance = DocumentChunk.embedding.cosine_distance(query_vector)

    stmt = select(DocumentChunk, distance.label("distance")).order_by(distance).limit(top_k)
    if tags:
        # Postgres's `?` jsonb operator: true if the given string is one of the
        # top-level elements of the `tags` JSONB array (exact match per tag,
        # not a substring match against the array's serialized text).
        stmt = stmt.where(or_(*[DocumentChunk.doc_metadata["tags"].op("?")(tag) for tag in tags]))

    rows = (await db.execute(stmt)).all()

    chunks = [
        RetrievedChunk(
            source_id=chunk.source_id,
            title=chunk.title,
            url=chunk.url,
            content=chunk.content,
            species_id=chunk.doc_metadata.get("species_id"),
            score=1 - distance_value,
        )
        for chunk, distance_value in rows
    ]
    return RetrievalResult(query=query, chunks=chunks)
