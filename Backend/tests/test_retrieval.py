"""retrieve_context tests — real embeddings, real pgvector, run against the
knowledge base ingested by scripts/ingest_knowledge_base.py (see
tests/conftest.py or Docs/setup.md for when that's run in this project's test
flow). See test_pokedex.py's module docstring for why real data over mocks.
"""

from app.db.session import AsyncSessionLocal, engine
from app.tools.retrieval import retrieve_context


async def test_retrieve_context_ranks_the_matching_document_first():
    async with AsyncSessionLocal() as db:
        result = await retrieve_context(db, "What are Kingambit's checks and counters?", top_k=3)
    await engine.dispose()

    assert result.chunks
    assert result.chunks[0].source_id == "ou-kingambit"
    assert result.chunks[0].score > 0.3


async def test_retrieve_context_citation_has_title_and_no_url_for_original_notes():
    async with AsyncSessionLocal() as db:
        result = await retrieve_context(db, "Terastallization defensive use", top_k=1)
    await engine.dispose()

    assert result.chunks[0].source_id == "general-terastallization"
    assert result.chunks[0].title == "Terastallization Basics — Strategy Notes"


async def test_retrieve_context_returns_empty_list_gracefully_for_top_k_zero():
    async with AsyncSessionLocal() as db:
        result = await retrieve_context(db, "anything", top_k=0)
    await engine.dispose()

    assert result.chunks == []


async def test_retrieve_context_tag_filter_restricts_to_matching_tag():
    async with AsyncSessionLocal() as db:
        result = await retrieve_context(db, "strategy", top_k=20, tags=["general_strategy"])
    await engine.dispose()

    assert result.chunks
    assert all(c.source_id.startswith("general-") for c in result.chunks)
