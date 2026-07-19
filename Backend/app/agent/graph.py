"""The Phase 2 agent graph: router -> tool_calls -> synthesizer -> END, with a
clarify_node short-circuit — see Docs/ai-agents-and-rag.md section 1 for the
full design rationale (kept intentionally small, one graph, not a 15-node
demo).

`build_agent_graph(llm_override)` takes an optional (router_llm, synthesizer_llm)
pair specifically so tests can substitute LangChain's own fake-chat-model test
doubles and exercise real graph wiring/branching without hitting a real
provider or needing an API key — see tests/test_agent_graph.py. Production
callers (run_agent) always use the real provider-backed LLMs from
app/agent/llm.py, wrapped with resilience (timeouts/retries/circuit breaker/
fallback) and quality guards (citation integrity, ungrounded damage claims).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any, TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import (
    get_router_llm,
    get_synthesizer_fallback_llm,
    get_synthesizer_llm,
)
from app.agent.quality import apply_quality_guards
from app.agent.reliability import ainvoke_with_resilience
from app.agent.tools import build_agent_tools
from app.agent.tracing import langfuse_callbacks
from app.schemas.rag import RetrievedChunk

# Cap prior turns so Team Builder + tool JSON don't blow the context window.
_MAX_HISTORY_MESSAGES = 10

ROUTER_SYSTEM_PROMPT = """You are the routing step of Master Ball's Professor, \
a competitive Pokemon coaching assistant on the Master Ball website. Decide \
which tool(s), if any, are needed to answer the user's question, and call \
them. If the question is too vague to act on (e.g. "is my team good?" with \
no team given and no prior context), do not call any tool — instead reply \
with a short clarifying question. If the question needs no tool (e.g. a \
greeting), reply directly.

Read the full conversation history. Follow-ups like "point me to the page" \
or "link that" refer to Pokemon/topics already named — call get_pokemon_profile \
(or the relevant tool) for that entity rather than asking what they meant.

When the user asks to be pointed to / linked to / shown a page for a Pokemon, \
move, ability, item, or type, call the appropriate lookup tool so the \
synthesizer can answer with Master Ball site links.

When the user asks to build a team or build around a Pokemon, gather enough \
tool results (profiles / meta / teammates) to support a full 6-Pokemon \
proposal — not just the named Pokemon and one partner."""

TEAM_BUILDER_INSTRUCTIONS = """[Team Builder mode] The user is on the Team \
Builder page and may ask you to build, fill out, or modify their competitive \
team. Default to a full 6-Pokemon team whenever they ask to build a team or \
build around a Pokemon — only propose fewer than 6 if they explicitly ask for \
a core, a single addition, a replacement, or a partial fill. Cover each of \
the 6 with a short role blurb and a `/pokedex/{id}` markdown link. When you \
propose a complete team, or a specific addition/replacement the user should \
be able to apply directly, end your answer with a single fenced code block \
labeled "showdown" containing a valid Pokemon Showdown team export (species, \
item, ability, EVs, nature, moves) for the *entire* 6-Pokemon team you're \
proposing, not just the new addition — applying it replaces the whole roster. \
Put your reasoning in prose above the block; never put prose inside it. Use \
get_pokemon_profile, lookup_meta_stats, and suggest_teammates to ground \
species/set choices in real data rather than guessing."""

SITE_MAP_PROMPT = """You are embedded in the Master Ball website. Prefer \
Master Ball pages over external sites (Smogon, Bulbapedia, etc.) unless the \
user explicitly wants an outside source or we have no on-site page.

Site routes (use markdown links with these exact path shapes; put the display \
name as link text and the tool's id / site_path in the URL):
- Pokemon profile: /pokedex/{id} — e.g. [Ludicolo](/pokedex/ludicolo)
- Move: /moves/{id}
- Ability: /abilities/{id}
- Item: /items/{id}
- Type chart page: /types/{Type} (capitalize the type, e.g. /types/Water)
- Team Builder: /team-builder
- Damage Calculator: /calculator
- Analytics / usage: /analytics
- Pokedex browse: /pokedex

When the user asks to be pointed to a page, lead with the markdown link — do \
not dump a full "Basic Info" essay unless they also asked for details. One \
short sentence plus the link is enough.

When discussing a Pokemon from get_pokemon_profile (or any tool result that \
includes site_path / id), include a markdown link using site_path (or \
/pokedex/{id}): [Ludicolo](/pokedex/ludicolo). Do **not** embed sprite_url as \
a markdown image — the Master Ball UI renders a showcase card automatically \
from the /pokedex/ link.

Format answers with clear markdown (short headings only when useful, bullet \
lists for sets/matchups, bold for key terms). Never paste bare internal ids \
as the only reference when a name + link is available."""

SYNTHESIZER_SYSTEM_PROMPT = f"""You are Master Ball's Professor: a competitive \
Pokemon coach that explains its reasoning in plain English, grounded in the \
tool results provided below — never invent stats, damage numbers, or strategy \
claims that aren't backed by them. When you use a retrieve_context result, \
cite it by its bracketed number (e.g. "[1]"). If a calculate_damage result \
used an assumed EV spread rather than one the user specified, say so \
explicitly. Be concise and specific rather than generic.

When the user asks you to build a team or build around a Pokemon, propose a \
full 6-Pokemon competitive team unless they explicitly want fewer (e.g. a \
core of 2–3, one teammate suggestion, or filling empty slots only). Link each \
of the six with `/pokedex/{{id}}` markdown links. Do not stop after naming a \
couple of partners.

{SITE_MAP_PROMPT}

Tool results are JSON and many objects carry both a display "name" (e.g. \
"Volt Switch", "Landorus-Therian") and an internal "id"/"species_id"/ \
"move_id"/etc. field (e.g. "voltswitch", "landorustherian") used only for \
lookups and URLs — always write the "name" in your answer, never the bare \
id field as visible prose. Pokemon profiles include "site_path" — use that \
for the markdown link; do not paste sprite_url images.

Do not call any tool now, even though the schemas are available to you — \
this is your one chance to answer. If the results above are incomplete, \
say so in prose and answer with what you have rather than requesting more \
tool calls, which will silently be ignored."""


def _content_to_text(content: Any) -> str:
    """Normalizes a LangChain message's `.content` into plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts)
    return str(content) if content else ""


def _compose_query(query: str, team_builder: bool, team_context: list[str] | None) -> str:
    if not team_builder:
        return query
    team_line = (
        f"Current team: {', '.join(team_context)}."
        if team_context
        else "Current team: empty — no Pokemon added yet."
    )
    return f"{TEAM_BUILDER_INSTRUCTIONS}\n\n{team_line}\n\nUser: {query}"


def _run_config() -> dict[str, Any]:
    callbacks = langfuse_callbacks()
    return {"callbacks": callbacks} if callbacks else {}


class AgentUnavailableError(RuntimeError):
    """Raised when the configured LLM provider(s) aren't available — see
    app/agent/llm.py's MissingProviderKeyError, which this wraps for the API
    layer to turn into a clean 503 rather than a raw 500."""


class AgentAnswer(TypedDict):
    answer: str
    needs_clarification: bool
    citations: list[RetrievedChunk]
    turn_id: str
    quality_warnings: list[str]


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    needs_clarification: bool
    answer: str | None
    citations: list[RetrievedChunk]
    tools_used: list[str]
    quality_warnings: list[str]


def _make_router_node(router_llm: BaseChatModel, tools: list):
    bound_llm = router_llm.bind_tools(tools)

    async def router_node(state: AgentState) -> dict:
        response = await ainvoke_with_resilience(
            bound_llm,
            [SystemMessage(content=ROUTER_SYSTEM_PROMPT), *state["messages"]],
            primary_provider="openai_router",
        )
        return {"messages": [response]}

    return router_node


def _make_tool_node(tools: list):
    tools_by_name = {t.name: t for t in tools}

    async def tool_node(state: AgentState) -> dict:
        last_message = state["messages"][-1]
        tool_calls = getattr(last_message, "tool_calls", None) or []

        results: list[ToolMessage] = []
        used: list[str] = list(state.get("tools_used") or [])
        for call in tool_calls:
            tool = tools_by_name[call["name"]]
            result = await tool.ainvoke(call["args"])
            used.append(call["name"])
            results.append(
                ToolMessage(content=str(result), tool_call_id=call["id"], name=call["name"])
            )
        return {"messages": results, "tools_used": used}

    return tool_node


def _make_synthesizer_node(
    synthesizer_llm: BaseChatModel,
    tools: list,
    citations_sink: list[RetrievedChunk],
    fallback_llm: BaseChatModel | None = None,
):
    bound_llm = (
        synthesizer_llm.bind_tools(tools, tool_choice={"type": "none"})
        if tools
        else synthesizer_llm
    )
    bound_fallback = None
    if fallback_llm is not None:
        bound_fallback = (
            fallback_llm.bind_tools(tools, tool_choice={"type": "none"})
            if tools
            else fallback_llm
        )

    async def synthesizer_node(state: AgentState) -> dict:
        messages = [SystemMessage(content=SYNTHESIZER_SYSTEM_PROMPT), *state["messages"]]
        response = await ainvoke_with_resilience(
            bound_llm,
            messages,
            primary_provider="anthropic_synthesizer",
            fallback=bound_fallback,
            fallback_provider="openai_synthesizer_fallback" if bound_fallback else None,
        )
        answer = _content_to_text(response.content)
        if not answer.strip():
            response = await ainvoke_with_resilience(
                bound_llm,
                [
                    *messages,
                    HumanMessage(
                        content=(
                            "Using the tool results above, write your complete "
                            "answer now as plain prose. Do not call any tools."
                        )
                    ),
                ],
                primary_provider="anthropic_synthesizer",
                fallback=bound_fallback,
                fallback_provider="openai_synthesizer_fallback" if bound_fallback else None,
            )
            answer = _content_to_text(response.content)

        quality = apply_quality_guards(
            answer, list(citations_sink), set(state.get("tools_used") or [])
        )
        return {
            "answer": quality.answer,
            "citations": quality.citations,
            "quality_warnings": quality.warnings,
        }

    return synthesizer_node


def _direct_reply_node(state: AgentState) -> dict:
    last_message = state["messages"][-1]
    content = _content_to_text(last_message.content)
    return {
        "answer": content,
        "needs_clarification": content.rstrip().endswith("?"),
        "citations": [],
        "quality_warnings": [],
    }


def _route_after_router(state: AgentState) -> str:
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", None) or []
    return "tool_calls" if tool_calls else "direct_reply"


def build_agent_graph(
    db: AsyncSession,
    llm_override: tuple[BaseChatModel, BaseChatModel] | None = None,
) -> tuple:
    """Returns (compiled_graph, citations_sink)."""
    if llm_override:
        router_llm, synthesizer_llm = llm_override
        fallback_llm = None
    else:
        router_llm = get_router_llm()
        synthesizer_llm = get_synthesizer_llm()
        fallback_llm = get_synthesizer_fallback_llm()

    citations_sink: list[RetrievedChunk] = []
    tools = build_agent_tools(db, citations_sink)

    graph = StateGraph(AgentState)
    graph.add_node("router", _make_router_node(router_llm, tools))
    graph.add_node("tool_calls", _make_tool_node(tools))
    graph.add_node(
        "synthesizer",
        _make_synthesizer_node(synthesizer_llm, tools, citations_sink, fallback_llm),
    )
    graph.add_node("direct_reply", _direct_reply_node)

    graph.set_entry_point("router")
    graph.add_conditional_edges(
        "router", _route_after_router, {"tool_calls": "tool_calls", "direct_reply": "direct_reply"}
    )
    graph.add_edge("tool_calls", "synthesizer")
    graph.add_edge("synthesizer", END)
    graph.add_edge("direct_reply", END)

    return graph.compile(), citations_sink


def _history_as_messages(history: list[dict[str, str]] | None) -> list[BaseMessage]:
    """Maps client-sent prior turns into LangChain messages (oldest → newest)."""
    if not history:
        return []
    trimmed = history[-_MAX_HISTORY_MESSAGES:]
    messages: list[BaseMessage] = []
    for turn in trimmed:
        role = (turn.get("role") or "").strip()
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    return messages


def _initial_state(
    effective_query: str, history: list[dict[str, str]] | None = None
) -> AgentState:
    return {
        "messages": [*_history_as_messages(history), HumanMessage(content=effective_query)],
        "needs_clarification": False,
        "answer": None,
        "citations": [],
        "tools_used": [],
        "quality_warnings": [],
    }


async def run_agent(
    db: AsyncSession,
    query: str,
    llm_override: tuple[BaseChatModel, BaseChatModel] | None = None,
    team_builder: bool = False,
    team_context: list[str] | None = None,
    history: list[dict[str, str]] | None = None,
) -> AgentAnswer:
    turn_id = uuid.uuid4().hex
    try:
        compiled_graph, _ = build_agent_graph(db, llm_override=llm_override)
    except Exception as exc:
        raise AgentUnavailableError(str(exc)) from exc

    effective_query = _compose_query(query, team_builder, team_context)
    try:
        result = await compiled_graph.ainvoke(
            _initial_state(effective_query, history), config=_run_config()
        )
    except Exception as exc:
        raise AgentUnavailableError(str(exc)) from exc

    return AgentAnswer(
        answer=result.get("answer") or "",
        needs_clarification=result.get("needs_clarification", False),
        citations=result.get("citations", []),
        turn_id=turn_id,
        quality_warnings=result.get("quality_warnings", []),
    )


async def stream_agent(
    db: AsyncSession,
    query: str,
    llm_override: tuple[BaseChatModel, BaseChatModel] | None = None,
    team_builder: bool = False,
    team_context: list[str] | None = None,
    history: list[dict[str, str]] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Streams agent events for WS /chat/ws.

    - {"type": "token", "content": str}
    - {"type": "done", "answer", "needs_clarification", "citations", "turn_id",
       "quality_warnings"}
    """
    turn_id = uuid.uuid4().hex
    try:
        compiled_graph, _ = build_agent_graph(db, llm_override=llm_override)
    except Exception as exc:
        raise AgentUnavailableError(str(exc)) from exc

    effective_query = _compose_query(query, team_builder, team_context)
    try:
        async for event in compiled_graph.astream_events(
            _initial_state(effective_query, history), version="v2", config=_run_config()
        ):
            kind = event["event"]
            node = event.get("metadata", {}).get("langgraph_node")

            if kind == "on_chat_model_stream" and node == "synthesizer":
                content = _content_to_text(event["data"]["chunk"].content)
                if content:
                    yield {"type": "token", "content": content}
            elif kind == "on_chain_end" and event.get("name") == "direct_reply":
                answer = event["data"]["output"].get("answer")
                if answer:
                    yield {"type": "token", "content": answer}
            elif kind == "on_chain_end" and event.get("name") == "LangGraph":
                output = event["data"]["output"]
                yield {
                    "type": "done",
                    "answer": output.get("answer") or "",
                    "needs_clarification": output.get("needs_clarification", False),
                    "citations": [c.model_dump() for c in output.get("citations", [])],
                    "turn_id": turn_id,
                    "quality_warnings": output.get("quality_warnings", []),
                }
    except Exception as exc:
        raise AgentUnavailableError(str(exc)) from exc


__all__ = [
    "AgentAnswer",
    "AgentState",
    "AgentUnavailableError",
    "build_agent_graph",
    "run_agent",
    "stream_agent",
]
