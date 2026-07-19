"""RAGAS-based retrieval eval (Phase 4) — see eval/README.md and
Docs/ai-agents-and-rag.md section 5.

Runs every entry in eval/golden/retrieval.jsonl through the real
retrieve_context tool (real pgvector + real fastembed embeddings, no LLM,
no API key, no mocking) and scores it two ways:

1. Exact source-id precision/recall — did retrieve_context return the
   expected knowledge-base document(s) at all?
2. RAGAS's NonLLMContextRecall / NonLLMContextPrecisionWithReference —
   string-similarity-based versions of the standard RAGAS retrieval metrics
   that don't require an LLM judge, scoring how closely the *retrieved
   chunk text* matches the real body text of each entry's expected source
   document(s). The golden file only stores `expected_source_ids`, not a
   hand-copied excerpt: reference_contexts are built here, at eval time, by
   reading the same app/data/knowledge_base/*.md bodies
   scripts/ingest_knowledge_base.py itself ingests — so there's exactly one
   place a document's real content lives, and this eval can never drift out
   of sync with what's actually in pgvector after a re-ingest.

Deliberately does NOT run RAGAS's LLM-judged metrics (faithfulness,
answer_relevancy) here — those need a real LLM call per sample, which costs
real money and requires ANTHROPIC_API_KEY/OPENAI_API_KEY to be configured.
This script is the CI-safe, always-runnable half of the eval loop; the
LLM-judged half is a separate, deliberately manual/opt-in check (see
eval/README.md) consistent with this project's cost-discipline principle
(Docs/tech-stack.md#performance--cost-discipline).

Run: uv run python -m scripts.run_ragas_eval
Exit code is non-zero if any metric falls below its threshold, so this is
safe to wire into a CI job as a gate once CI has DB access (see
eval/README.md's "CI" note for the current gap).
"""

import asyncio
import json
import sys
from pathlib import Path

from ragas.dataset_schema import SingleTurnSample
from ragas.metrics import NonLLMContextPrecisionWithReference, NonLLMContextRecall

from app.db.session import AsyncSessionLocal, engine
from app.tools.retrieval import retrieve_context
from scripts.ingest_knowledge_base import load_documents

GOLDEN_PATH = Path(__file__).resolve().parent.parent / "eval" / "golden" / "retrieval.jsonl"

# Below these, the retrieval pipeline (embedding model, chunking, or the
# knowledge base content itself) needs attention before shipping a change —
# not arbitrary numbers, chosen so a single totally-missed query in this
# small a golden set trips the gate.
MIN_SOURCE_RECALL = 0.9
MIN_RAGAS_RECALL = 0.7
MIN_RAGAS_PRECISION = 0.7


def load_golden() -> list[dict]:
    with GOLDEN_PATH.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_reference_bodies() -> dict[str, str]:
    """source_id -> full body text, straight from the same knowledge-base
    files scripts/ingest_knowledge_base.py chunks and embeds."""
    return {doc.doc_id: doc.text for doc in load_documents()}


async def main() -> int:
    golden = load_golden()
    reference_bodies = load_reference_bodies()
    recall_metric = NonLLMContextRecall()
    precision_metric = NonLLMContextPrecisionWithReference()

    rows = []
    async with AsyncSessionLocal() as db:
        for entry in golden:
            result = await retrieve_context(db, entry["query"])
            retrieved_ids = [c.source_id for c in result.chunks]
            retrieved_texts = [c.content for c in result.chunks]

            hit = any(sid in retrieved_ids for sid in entry["expected_source_ids"])
            reference_contexts = [
                reference_bodies[sid]
                for sid in entry["expected_source_ids"]
                if sid in reference_bodies
            ]

            sample = SingleTurnSample(
                user_input=entry["query"],
                retrieved_contexts=retrieved_texts,
                reference_contexts=reference_contexts,
            )
            ragas_recall = await recall_metric.single_turn_ascore(sample)
            ragas_precision = await precision_metric.single_turn_ascore(sample)

            rows.append(
                {
                    "query": entry["query"],
                    "expected_source_ids": entry["expected_source_ids"],
                    "retrieved_source_ids": retrieved_ids,
                    "source_hit": hit,
                    "ragas_context_recall": ragas_recall,
                    "ragas_context_precision": ragas_precision,
                }
            )
    await engine.dispose()

    source_recall = sum(r["source_hit"] for r in rows) / len(rows)
    mean_ragas_recall = sum(r["ragas_context_recall"] for r in rows) / len(rows)
    mean_ragas_precision = sum(r["ragas_context_precision"] for r in rows) / len(rows)

    print(f"{'query':<70} {'hit':<5} {'recall':<8} {'precision':<8}")
    for r in rows:
        print(
            f"{r['query'][:68]:<70} {str(r['source_hit']):<5} "
            f"{r['ragas_context_recall']:<8.2f} {r['ragas_context_precision']:<8.2f}"
        )
    print()
    print(f"Exact source-id recall:        {source_recall:.2f}  (threshold {MIN_SOURCE_RECALL})")
    print(
        f"RAGAS NonLLM context recall:    {mean_ragas_recall:.2f}  (threshold {MIN_RAGAS_RECALL})"
    )
    print(
        f"RAGAS NonLLM context precision: {mean_ragas_precision:.2f}  "
        f"(threshold {MIN_RAGAS_PRECISION})"
    )

    passed = (
        source_recall >= MIN_SOURCE_RECALL
        and mean_ragas_recall >= MIN_RAGAS_RECALL
        and mean_ragas_precision >= MIN_RAGAS_PRECISION
    )
    if not passed:
        print("\nFAILED — one or more retrieval metrics fell below threshold.")
        return 1
    print("\nPASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
