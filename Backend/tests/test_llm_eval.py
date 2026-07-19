"""tests/test_llm_eval.py covers only the parts of scripts/run_llm_eval.py
that don't require a real, billed LLM call — the golden file's shape, and
the graceful "no provider key configured" exit path. The actual
Faithfulness/ResponseRelevancy scoring is exercised by manually running
`uv run python -m scripts.run_llm_eval` with real API keys set (see
eval/README.md) — not by the automated test suite, per this project's cost
discipline (Docs/tech-stack.md#performance--cost-discipline).
"""

from scripts.run_llm_eval import load_golden, main


def test_golden_chat_set_is_well_formed():
    golden = load_golden()
    assert len(golden) >= 3

    for entry in golden:
        assert entry["id"]
        assert entry["message"]
        assert entry["expected_keywords"], f"{entry['id']!r} has no expected_keywords"


async def test_exits_cleanly_with_a_clear_message_when_no_provider_key_is_configured():
    """Mirrors app/agent/llm.py's MissingProviderKeyError path — this script
    must never fabricate a score when there's no real LLM to judge with."""
    exit_code = await main()
    assert exit_code == 1
