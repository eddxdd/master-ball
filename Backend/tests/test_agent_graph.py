"""Tests for the Phase 2 LangGraph agent (app/agent/graph.py), run against the
real seeded DB and a real embedding model/pgvector for retrieve_context (see
test_pokedex.py's module docstring for why real data over mocks), but with a
*fake* LLM standing in for the router/synthesizer — this is a standard,
legitimate LangChain testing pattern (see langchain_core's own
GenericFakeChatModel), not a "hardcoded stopgap" the project's real-data rule
is about: it tests that the graph's branching/wiring is correct, it doesn't
ship a fake answer to a real user. Exercising the graph against a real
provider is a manual/opt-in check (see Docs/backend/README.md's "AI agent"
section) since it costs money and needs a real API key.
"""

from typing import Any

import pytest
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from app.agent.graph import run_agent
from app.db.session import AsyncSessionLocal, engine


class FakeToolCallingChatModel(BaseChatModel):
    """A minimal fake chat model whose canned `responses` are returned in
    order, one per `.ainvoke()` call. `bind_tools` is a no-op stub (returns
    self) since the canned AIMessages already carry hardcoded `tool_calls`
    rather than the model actually deciding them — that's the point: this
    tests the *graph's* handling of a tool-calling response, not a real
    provider's tool-selection quality."""

    responses: list[BaseMessage]
    calls: list[list[BaseMessage]] = []

    def bind_tools(self, tools: list[Any], **kwargs: Any) -> "FakeToolCallingChatModel":
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        self.calls.append(messages)
        response = self.responses[len(self.calls) - 1]
        return ChatResult(generations=[ChatGeneration(message=response)])

    @property
    def _llm_type(self) -> str:
        return "fake-tool-calling-chat-model"


@pytest.fixture
async def db():
    # Each pytest-asyncio test gets its own fresh event loop, but the engine's
    # connection pool (module-level in app/db/session.py) is bound to whichever
    # loop first used it — disposing after every test forces a fresh pool bound
    # to *this* test's loop instead of reusing a stale one, which otherwise
    # surfaces as a cryptic Windows ProactorEventLoop transport error the
    # moment two DB calls run concurrently (see app/agent/tools.py's
    # asyncio.gather'd tool calls). Same root cause as main.py's lifespan
    # disposing the engine between TestClient contexts.
    async with AsyncSessionLocal() as session:
        yield session
    await engine.dispose()


async def test_direct_reply_when_router_calls_no_tool(db):
    router = FakeToolCallingChatModel(responses=[AIMessage(content="Hey there, happy to help.")])
    synthesizer = FakeToolCallingChatModel(responses=[])

    result = await run_agent(db, "hello", llm_override=(router, synthesizer))

    assert result["answer"] == "Hey there, happy to help."
    assert result["needs_clarification"] is False
    assert result["citations"] == []
    assert result["turn_id"]
    assert result["quality_warnings"] == []
    assert (
        len(synthesizer.calls) == 0
    )  # never reached — no tool call means no tool output to synthesize


async def test_direct_reply_flags_a_clarifying_question(db):
    router = FakeToolCallingChatModel(
        responses=[AIMessage(content="Which Pokemon's matchup do you want me to check?")]
    )
    synthesizer = FakeToolCallingChatModel(responses=[])

    result = await run_agent(db, "is my team good", llm_override=(router, synthesizer))

    assert result["needs_clarification"] is True


async def test_tool_call_then_synthesis_for_a_retrieve_context_question(db):
    router_response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "retrieve_context",
                "args": {"query": "What checks Kingambit?"},
                "id": "call_1",
            }
        ],
    )
    router = FakeToolCallingChatModel(responses=[router_response])
    synthesizer = FakeToolCallingChatModel(
        responses=[AIMessage(content="Fighting-type coverage and faster attackers check it. [1]")]
    )

    result = await run_agent(db, "What checks Kingambit?", llm_override=(router, synthesizer))

    assert result["answer"] == "Fighting-type coverage and faster attackers check it. [1]"
    assert len(synthesizer.calls) == 1
    # The synthesizer must actually receive the tool's output, not just the
    # original question — this is what makes the answer "grounded".
    synthesizer_input = synthesizer.calls[0]
    assert any("Kingambit" in str(m.content) for m in synthesizer_input)
    # retrieve_context's real DB/embedding results should surface as citations.
    assert len(result["citations"]) > 0
    assert any(c.source_id == "ou-kingambit" for c in result["citations"])


async def test_tool_call_runs_calculate_damage_with_default_ev_spread(db):
    router_response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "calculate_damage",
                "args": {
                    "attacker_name": "Landorus-Therian",
                    "defender_name": "Corviknight",
                    "move_name": "Earthquake",
                },
                "id": "call_1",
            }
        ],
    )
    router = FakeToolCallingChatModel(responses=[router_response])
    synthesizer = FakeToolCallingChatModel(
        responses=[AIMessage(content="Earthquake doesn't hit Corviknight at all — it's immune.")]
    )

    result = await run_agent(
        db, "Does Landorus-T's Earthquake hit Corviknight?", llm_override=(router, synthesizer)
    )

    assert "immune" in result["answer"]
    tool_message_contents = [str(m.content) for m in synthesizer.calls[0]]
    assert any("is_immune" in c for c in tool_message_contents)


async def test_history_is_prepended_to_router_messages(db):
    router = FakeToolCallingChatModel(responses=[AIMessage(content="Here's [Ludicolo](/pokedex/ludicolo).")])
    synthesizer = FakeToolCallingChatModel(responses=[])

    result = await run_agent(
        db,
        "Point me to the page",
        llm_override=(router, synthesizer),
        history=[
            {"role": "user", "content": "Tell me about Ludicolo"},
            {"role": "assistant", "content": "Ludicolo is a Water/Grass dancer."},
        ],
    )

    assert "Ludicolo" in result["answer"]
    router_input = router.calls[0]
    # Prior turns must land before the current HumanMessage so follow-ups resolve.
    contents = [str(m.content) for m in router_input if hasattr(m, "content")]
    assert any("Tell me about Ludicolo" in c for c in contents)
    assert any("Point me to the page" in c for c in contents)
    ludicolo_idx = next(i for i, c in enumerate(contents) if "Tell me about Ludicolo" in c)
    current_idx = next(i for i, c in enumerate(contents) if "Point me to the page" in c)
    assert ludicolo_idx < current_idx


async def test_agent_unavailable_error_when_no_provider_keys_configured():
    from app.agent.graph import AgentUnavailableError

    async with AsyncSessionLocal() as db:
        with pytest.raises(AgentUnavailableError):
            await run_agent(db, "hello")
