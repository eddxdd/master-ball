"""Shared embedding client for the RAG pipeline (ingestion *and* retrieval must
use the exact same model — otherwise query/document vectors aren't comparable).

Uses fastembed (ONNX runtime, no GPU/torch needed) with BAAI/bge-small-en-v1.5
(384-dim) rather than an OpenAI/Bedrock embeddings API call: it's a real,
good-quality, widely-used open embedding model that runs locally for free, which
matters twice over here — (1) no API key is required just to run retrieval
locally/in tests, and (2) it's consistent with the "cache/compute locally before
reaching for a paid API" performance-and-cost principle in
Docs/tech-stack.md#performance--cost-discipline. The model file (~130MB) is
downloaded once from Hugging Face and cached on disk (EMBEDDING_CACHE_DIR);
this is the same "fetch once, cache locally" shape as the PokeAPI description
cache from Phase 1, not a live per-request external call.
"""

from functools import lru_cache

from fastembed import TextEmbedding

from app.core.config import get_settings

MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache
def get_embedding_model() -> TextEmbedding:
    settings = get_settings()
    return TextEmbedding(model_name=MODEL_NAME, cache_dir=settings.embedding_cache_dir)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch-embeds documents (ingestion side). fastembed returns numpy arrays;
    callers (Pydantic/pgvector) need plain lists."""
    model = get_embedding_model()
    return [vector.tolist() for vector in model.embed(texts)]


def embed_query(query: str) -> list[float]:
    """Embeds a single search query. bge models are trained with an asymmetric
    query/passage distinction — `query_embed` prepends the model's expected
    "represent this sentence for searching relevant passages" instruction
    prefix, which document embedding (`embed_texts`/`model.embed`) deliberately
    does not, since documents aren't queries."""
    model = get_embedding_model()
    return next(model.query_embed(query)).tolist()
