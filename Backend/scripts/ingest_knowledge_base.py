"""Ingests app/data/knowledge_base/*.md into pgvector's document_chunks table
— the Phase 2 RAG pipeline: parse -> LlamaIndex chunking -> fastembed
embeddings -> pgvector upsert. See Docs/backend/README.md's "RAG knowledge
base" section and Docs/ai-agents-and-rag.md section 3.

The knowledge base itself is original strategy content written for this
project, not scraped Smogon prose — see the knowledge_base directory's own
note for why. This script's pipeline shape (a directory of documents ->
chunked nodes -> embeddings -> vector store) is what would front a live
source (a scheduled scrape/fetch job, per the "batch ingestion over live
per-request calls" principle in Docs/tech-stack.md) if/when one is added; it
doesn't need to change to support that, only `load_documents` would need a
new source.

Re-running this script is idempotent: each source document's existing chunks
are deleted before its new ones are inserted, keyed by `source_id` (the `id`
header field), so it never accumulates duplicates.

Run: uv run python -m scripts.ingest_knowledge_base
"""

import asyncio
import re
from pathlib import Path

from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.knowledge import DocumentChunk
from app.tools.embeddings import embed_texts

KB_DIR = Path(__file__).resolve().parent.parent / "app" / "data" / "knowledge_base"

_HEADER_LINE = re.compile(r"^(\w+):\s*(.+)$")


def _parse_document(path: Path) -> tuple[dict[str, str], str]:
    """Splits a knowledge-base markdown file into its header lines (`id: ...`,
    `title: ...`, `tags: ...`, optional `species_id: ...`/`url: ...`) and body
    text. Deliberately not YAML frontmatter — every field here is a single
    plain string, so a tiny hand-rolled parser avoids a dependency for a
    problem this small."""
    lines = path.read_text(encoding="utf-8").splitlines()
    header: dict[str, str] = {}
    body_start = 0
    for i, line in enumerate(lines):
        if not line.strip():
            body_start = i + 1
            break
        match = _HEADER_LINE.match(line)
        if not match:
            break
        header[match.group(1)] = match.group(2).strip()
        body_start = i + 1
    body = "\n".join(lines[body_start:]).strip()
    return header, body


def load_documents() -> list[Document]:
    documents = []
    for path in sorted(KB_DIR.glob("*.md")):
        if path.name == "README.md":
            continue  # documents the format itself, not a document to ingest
        header, body = _parse_document(path)
        if "id" not in header or "title" not in header:
            raise ValueError(f"{path} is missing a required 'id'/'title' header field")
        tags = [t.strip() for t in header.get("tags", "").split(",") if t.strip()]
        documents.append(
            Document(
                text=body,
                doc_id=header["id"],
                metadata={
                    "title": header["title"],
                    "url": header.get("url"),
                    "tags": tags,
                    "species_id": header.get("species_id"),
                },
            )
        )
    return documents


async def ingest(documents: list[Document] | None = None) -> int:
    documents = documents if documents is not None else load_documents()
    splitter = SentenceSplitter(chunk_size=400, chunk_overlap=40)
    nodes = splitter.get_nodes_from_documents(documents)

    texts = [node.get_content() for node in nodes]
    embeddings = embed_texts(texts) if texts else []

    async with AsyncSessionLocal() as session:
        source_ids = {node.ref_doc_id for node in nodes if node.ref_doc_id}
        if source_ids:
            await session.execute(
                delete(DocumentChunk).where(DocumentChunk.source_id.in_(source_ids))
            )

        chunk_indices: dict[str, int] = {}
        for node, embedding in zip(nodes, embeddings, strict=True):
            source_id = node.ref_doc_id or "unknown"
            index = chunk_indices.get(source_id, 0)
            chunk_indices[source_id] = index + 1
            meta = node.metadata
            session.add(
                DocumentChunk(
                    source_id=source_id,
                    chunk_index=index,
                    title=meta["title"],
                    url=meta.get("url"),
                    content=node.get_content(),
                    doc_metadata={
                        "tags": meta.get("tags", []),
                        "species_id": meta.get("species_id"),
                    },
                    embedding=embedding,
                )
            )
        await session.commit()

    return len(nodes)


def main() -> None:
    documents = load_documents()
    count = asyncio.run(ingest(documents))
    print(f"Ingested {count} chunks from {len(documents)} source documents.")


if __name__ == "__main__":
    main()
