"""LLM-judged eval (Phase 4) — RAGAS's Faithfulness + ResponseRelevancy
metrics against the real Phase 2 agent, plus the deterministic keyword
checks from eval/golden/chat.jsonl. See eval/README.md for why this is a
separate, deliberately manual/opt-in script rather than part of
scripts/run_ragas_eval.py or the pytest suite.

Unlike run_ragas_eval.py's NonLLM metrics, Faithfulness and ResponseRelevancy
require a real LLM call per sample (an LLM judges whether the answer's
claims are supported by the retrieved context, and whether the answer
actually addresses the question) — that costs real money and needs
ANTHROPIC_API_KEY/OPENAI_API_KEY configured, so this is never run
automatically in CI or the test suite, matching this project's cost
discipline principle (Docs/tech-stack.md#performance--cost-discipline).

Run: uv run python -m scripts.run_llm_eval
"""

import asyncio
import json
import sys
from pathlib import Path

from langchain_core.embeddings import Embeddings
from ragas.dataset_schema import SingleTurnSample
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness, ResponseRelevancy

from app.agent.graph import AgentUnavailableError, run_agent
from app.agent.llm import get_synthesizer_llm
from app.db.session import AsyncSessionLocal, engine
from app.tools.embeddings import embed_query, embed_texts

GOLDEN_PATH = Path(__file__).resolve().parent.parent / "eval" / "golden" / "chat.jsonl"


class FastembedLangchainEmbeddings(Embeddings):
    """Adapts app/tools/embeddings.py's fastembed functions to LangChain's
    Embeddings interface, which is what RAGAS's LangchainEmbeddingsWrapper
    (used by ResponseRelevancy) expects. Kept local to this eval script —
    the rest of the app never needs embeddings behind LangChain's interface,
    only RAGAS does."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return embed_texts(texts)

    def embed_query(self, text: str) -> list[float]:
        return embed_query(text)


def load_golden() -> list[dict]:
    with GOLDEN_PATH.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


async def main() -> int:
    golden = load_golden()

    try:
        judge_llm = LangchainLLMWrapper(get_synthesizer_llm())
    except Exception as exc:  # MissingProviderKeyError from app/agent/llm.py
        print(f"Can't run the LLM-judged eval: {exc}")
        return 1

    judge_embeddings = LangchainEmbeddingsWrapper(FastembedLangchainEmbeddings())
    faithfulness = Faithfulness(llm=judge_llm)
    relevancy = ResponseRelevancy(llm=judge_llm, embeddings=judge_embeddings)

    rows = []
    async with AsyncSessionLocal() as db:
        for entry in golden:
            try:
                result = await run_agent(db, entry["message"])
            except AgentUnavailableError as exc:
                print(f"Can't run the LLM-judged eval: {exc}")
                return 1

            answer = result["answer"]
            contexts = [c["content"] for c in result["citations"]] or [answer]
            keyword_hits = [kw for kw in entry["expected_keywords"] if kw.lower() in answer.lower()]
            keyword_pass = len(keyword_hits) == len(entry["expected_keywords"])

            sample = SingleTurnSample(
                user_input=entry["message"], response=answer, retrieved_contexts=contexts
            )
            faithfulness_score = await faithfulness.single_turn_ascore(sample)
            relevancy_score = await relevancy.single_turn_ascore(sample)

            rows.append(
                {
                    "id": entry["id"],
                    "keyword_pass": keyword_pass,
                    "missing_keywords": [
                        kw for kw in entry["expected_keywords"] if kw not in keyword_hits
                    ],
                    "faithfulness": faithfulness_score,
                    "relevancy": relevancy_score,
                    "answer": answer,
                }
            )
    await engine.dispose()

    print(f"{'id':<30} {'keywords':<10} {'faithfulness':<14} {'relevancy':<10}")
    for r in rows:
        print(
            f"{r['id']:<30} {str(r['keyword_pass']):<10} "
            f"{r['faithfulness']:<14.2f} {r['relevancy']:<10.2f}"
        )
        if not r["keyword_pass"]:
            print(f"    missing keywords: {r['missing_keywords']}")
        print(f"    answer: {r['answer'][:200]}")

    print(
        "\nThese scores are advisory, not a hard pass/fail gate — LLM-judged "
        "metrics carry real run-to-run variance (see eval/README.md). Use them "
        "to compare *before vs. after* a prompt/model change, not as an "
        "absolute bar."
    )
    all_keywords_passed = all(r["keyword_pass"] for r in rows)
    return 0 if all_keywords_passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
