"""Runs the Phase 4 RAGAS retrieval eval (scripts/run_ragas_eval.py) as part
of the normal test suite — so a retrieval/knowledge-base regression is
caught by `pytest`/CI, not only by someone remembering to run the eval
script by hand. See eval/README.md for the full eval-loop writeup.
"""

from app.db.session import engine
from scripts.run_ragas_eval import (
    MIN_RAGAS_PRECISION,
    MIN_RAGAS_RECALL,
    MIN_SOURCE_RECALL,
    load_golden,
    load_reference_bodies,
    main,
)


async def test_golden_retrieval_set_is_well_formed():
    golden = load_golden()
    assert len(golden) >= 10, "the golden retrieval set should cover most of the knowledge base"

    reference_bodies = load_reference_bodies()
    for entry in golden:
        assert entry["query"]
        assert entry["expected_source_ids"], f"{entry['query']!r} has no expected_source_ids"
        for source_id in entry["expected_source_ids"]:
            assert source_id in reference_bodies, (
                f"{source_id!r} (from {entry['query']!r}) isn't a real knowledge-base source_id"
            )


async def test_ragas_retrieval_eval_passes_against_the_real_seeded_knowledge_base():
    exit_code = await main()
    await engine.dispose()
    assert exit_code == 0, (
        f"Retrieval eval fell below one of its thresholds "
        f"(source_recall>={MIN_SOURCE_RECALL}, ragas_recall>={MIN_RAGAS_RECALL}, "
        f"ragas_precision>={MIN_RAGAS_PRECISION}) — see printed output above."
    )
