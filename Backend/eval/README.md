# Eval loop

The quality loop for the Professor agent — design rationale in [`Docs/ai-agents-and-rag.md`](../../Docs/ai-agents-and-rag.md#5-evaluation--observability-loop).

## Golden dataset (`eval/golden/*.jsonl`)

| File | Covers | Consumed by |
|---|---|---|
| `retrieval.jsonl` | 12 queries, one per knowledge-base document | `scripts/run_ragas_eval.py` + `tests/test_ragas_eval.py` (CI) |
| `chat.jsonl` | 4 regression chat questions | `scripts/run_llm_eval.py`, promptfoo |
| `red_team.jsonl` | 2 prompt-injection probes | promptfoo |
| `chat_from_feedback.jsonl` | Exported thumbs-down turns (generated, gitignored optional) | grow via `scripts/export_feedback_to_golden.py` |

## Tier 1 — deterministic, always runs (CI)

```bash
cd Backend
uv run python -m scripts.run_ragas_eval
# also: uv run pytest tests/test_ragas_eval.py
```

Gates every PR via the backend CI job (Postgres + seed + ingest + pytest). No API keys.

## Tier 2 — LLM-judged, opt-in

```bash
export ANTHROPIC_API_KEY=...
uv run python -m scripts.run_llm_eval
```

## promptfoo — live API regression + red-team

```bash
docker compose up -d backend
npx promptfoo eval -c Backend/eval/promptfoo/promptfooconfig.yaml --fail-on-error
```

**CI:** add the `run-agent-eval` label to a PR (requires `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` repo secrets). Intentionally opt-in so every PR doesn't spend on LLM calls.

## Feedback → golden set

Thumbs-down in the Professor UI hits `POST /chat/feedback`. Export new downs:

```bash
uv run python -m scripts.export_feedback_to_golden
```

## Observability companions

| Tool | How |
|---|---|
| LangSmith | `LANGCHAIN_API_KEY` — auto-on when `ENVIRONMENT` ≠ `local` |
| Langfuse | `docker compose -f docker-compose.yml -f docker-compose.langfuse.yml --profile observability up -d` then set `LANGFUSE_*` |
| Sentry | `SENTRY_DSN` / `VITE_SENTRY_DSN` |
| Structured logs | stdout JSON in staging/prod (`ENVIRONMENT=staging`) |
