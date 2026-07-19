"""The RAG knowledge base — chunks of strategy content, embedded and stored in
pgvector for the `retrieve_context` tool (Phase 2). See
Docs/backend/README.md's "RAG knowledge base" section and
Docs/ai-agents-and-rag.md section 3 for the full ingestion pipeline shape.

EMBEDDING_DIM must match whatever model app/tools/embeddings.py loads
(fastembed's BAAI/bge-small-en-v1.5 default is 384-dim) — if that model ever
changes, this column width needs a new migration, not just a code change.
"""

from pgvector.sqlalchemy import Vector
from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

EMBEDDING_DIM = 384


class DocumentChunk(Base):
    """One retrievable chunk of a source document. `source_id` + `chunk_index`
    together let re-ingestion delete-and-replace a document's chunks
    idempotently (see scripts/ingest_knowledge_base.py) instead of accumulating
    duplicates every time the ingestion script re-runs."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        Index(
            "ix_document_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_id: Mapped[str] = mapped_column(String, index=True)
    """Stable id for the source document, e.g. "ou-landorus-therian" — shared by
    every chunk of that document."""
    chunk_index: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String)
    """Human-readable citation title, e.g. "Landorus-Therian (OU) — Strategy Notes"."""
    url: Mapped[str | None] = mapped_column(String, default=None)
    """Optional link back to a canonical source, shown alongside the citation."""
    content: Mapped[str] = mapped_column(Text)
    doc_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    """Free-form tags for future source-type filtering (e.g. {"format": "OU",
    "kind": "pokemon_strategy"}) — see retrieve_context's `source_filter` input."""
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
