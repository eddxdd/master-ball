"""LangChain tool wrappers around this app's existing deterministic tools
(app/tools/*) plus retrieve_context, bound to a single request's DB session —
see Docs/ai-agents-and-rag.md section 2's tool table. These are the *same*
underlying implementations the REST API and (later) the MCP server use, per
Docs/architecture.md's "one implementation, three surfaces" principle — this
module only adds the LangChain-tool-calling schema/wiring on top, it doesn't
reimplement any logic.

Each tool is built per-request (`build_agent_tools(db)`) because they close
over that request's AsyncSession — LangChain tools are plain callables, so a
closure is simpler and just as correct as threading `db` through LangGraph's
state on every node.
"""

import json
from typing import Literal

from langchain_core.tools import StructuredTool
from poke_env.data.normalize import to_id_str
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.session import GraphUnavailableError
from app.schemas.calculator import DamageCalcRequest, FieldConditions, PokemonBattleState
from app.schemas.rag import RetrievedChunk
from app.schemas.team import PokemonSet, Team
from app.tools.damage_calc import DamageCalcError, calculate_damage
from app.tools.graph_query import suggest_teammates
from app.tools.meta_stats import DEFAULT_FORMAT, lookup_meta_stats
from app.tools.pokedex import get_pokemon_profile
from app.tools.retrieval import retrieve_context
from app.tools.scout import scout_opponent
from app.tools.win_probability import ModelUnavailableError
from app.tools.win_probability import predict_win_probability as predict_win_probability_tool

# analyze_team isn't bound as an agent tool yet — it needs a full 6-Pokemon
# Team payload (app/schemas/team.py) that isn't reliably extractable from a
# free-text chat message without a lot more scaffolding (e.g. asking the LLM
# to structured-output-parse a pasted Showdown export first). The existing
# Phase 1 REST endpoint (POST /team/analyze) already covers the "I pasted my
# team" flow directly; composing it into the chat agent is a natural
# follow-up once there's a structured-input path for it, not a Phase 2 gap.


class PokemonProfileInput(BaseModel):
    pokemon_name: str = Field(description="A Pokemon or forme name, e.g. 'Landorus-Therian'.")


class DamageCalcInput(BaseModel):
    attacker_name: str = Field(description="The attacking Pokemon's name or forme.")
    defender_name: str = Field(description="The defending Pokemon's name or forme.")
    move_name: str = Field(description="The move being used, e.g. 'Earthquake'.")
    attacker_item: str | None = Field(default=None, description="The attacker's held item, if any.")
    attacker_ability: str | None = Field(
        default=None, description="Override the attacker's ability."
    )
    attacker_tera_type: str | None = None
    defender_item: str | None = Field(default=None, description="The defender's held item, if any.")
    defender_ability: str | None = Field(
        default=None, description="Override the defender's ability."
    )
    defender_tera_type: str | None = None
    weather: Literal["sun", "rain"] | None = None
    is_critical: bool = False


class RetrieveContextInput(BaseModel):
    query: str = Field(
        description="A natural-language question to search the strategy knowledge base with."
    )


class MetaStatsInput(BaseModel):
    pokemon_name: str = Field(description="A Pokemon or forme name, e.g. 'Kingambit'.")


class ScoutOpponentInput(BaseModel):
    pokemon_name: str = Field(description="The opposing Pokemon to scout, e.g. 'Landorus-Therian'.")


class SuggestTeammatesInput(BaseModel):
    team_pokemon_names: list[str] = Field(
        description="The user's current team's Pokemon names/formes (1-5 of them)."
    )


class WinProbabilityInput(BaseModel):
    team_a_pokemon_names: list[str] = Field(description="Team A's Pokemon names/formes.")
    team_b_pokemon_names: list[str] = Field(description="Team B's Pokemon names/formes.")


def build_agent_tools(
    db: AsyncSession, citations_sink: list[RetrievedChunk] | None = None
) -> list[StructuredTool]:
    """`citations_sink`, if given, is appended to with every chunk returned by
    any retrieve_context call during this request — LangChain tool calls only
    return string content to the LLM, so this is how the API layer recovers
    structured citation data (source/title/url) for the final response instead
    of re-parsing the LLM's own prose (see Docs/ai-agents-and-rag.md's
    "Grounding discipline")."""

    async def _get_pokemon_profile(pokemon_name: str) -> str:
        profile = await get_pokemon_profile(db, to_id_str(pokemon_name))
        if profile is None:
            return f"No Pokemon found matching '{pokemon_name}'."
        data = profile.model_dump(mode="json")
        # Explicit site navigation fields for the synthesizer (markdown links /
        # sprites) — see SITE_MAP_PROMPT in app/agent/graph.py.
        data["site_path"] = f"/pokedex/{profile.id}"
        return json.dumps(data)

    async def _calculate_damage(
        attacker_name: str,
        defender_name: str,
        move_name: str,
        attacker_item: str | None = None,
        attacker_ability: str | None = None,
        attacker_tera_type: str | None = None,
        defender_item: str | None = None,
        defender_ability: str | None = None,
        defender_tera_type: str | None = None,
        weather: Literal["sun", "rain"] | None = None,
        is_critical: bool = False,
    ) -> str:
        # 252 EVs / neutral nature on both sides is this tool's baseline
        # assumption for a quick matchup check when the caller doesn't specify
        # a real spread — the synthesizer is expected to state that assumption
        # in its answer rather than imply it calculated an exact real-game set.
        request = DamageCalcRequest(
            attacker=PokemonBattleState(
                species_id=to_id_str(attacker_name),
                evs={"atk": 252, "spa": 252},
                item=to_id_str(attacker_item) if attacker_item else None,
                ability=to_id_str(attacker_ability) if attacker_ability else None,
                tera_type=attacker_tera_type.capitalize() if attacker_tera_type else None,
            ),
            defender=PokemonBattleState(
                species_id=to_id_str(defender_name),
                evs={"hp": 252, "def": 252, "spd": 252},
                item=to_id_str(defender_item) if defender_item else None,
                ability=to_id_str(defender_ability) if defender_ability else None,
                tera_type=defender_tera_type.capitalize() if defender_tera_type else None,
            ),
            move_id=to_id_str(move_name),
            field=FieldConditions(weather=weather, is_critical=is_critical),
        )
        try:
            result = await calculate_damage(db, request)
        except DamageCalcError as exc:
            return f"Couldn't calculate that: {exc}"
        return result.model_dump_json()

    async def _retrieve_context(query: str) -> str:
        result = await retrieve_context(db, query)
        if citations_sink is not None:
            citations_sink.extend(result.chunks)
        if not result.chunks:
            return "No relevant strategy notes found."
        return "\n\n".join(f"[{i + 1}] {c.title}\n{c.content}" for i, c in enumerate(result.chunks))

    async def _lookup_meta_stats(pokemon_name: str) -> str:
        result = await lookup_meta_stats(db, to_id_str(pokemon_name), DEFAULT_FORMAT)
        if result is None:
            return (
                f"No synced usage stats for '{pokemon_name}' — the meta-stats sync job "
                "(scripts/sync_usage_stats.py) may not have run yet, or this isn't a real "
                f"{DEFAULT_FORMAT} Pokemon."
            )
        data = result.model_dump(mode="json")
        data["site_path"] = f"/pokedex/{result.species_id}"
        return json.dumps(data)

    async def _scout_opponent(pokemon_name: str) -> str:
        report = await scout_opponent(db, pokemon_name, DEFAULT_FORMAT)
        data = report.model_dump(mode="json")
        data["site_path"] = f"/pokedex/{report.species_id}"
        return json.dumps(data)

    async def _suggest_teammates(team_pokemon_names: list[str]) -> str:
        team_ids = [to_id_str(name) for name in team_pokemon_names]
        try:
            result = await suggest_teammates(team_ids)
        except GraphUnavailableError as exc:
            return f"Couldn't reach the teammate-suggestion knowledge graph: {exc}"
        if not result.candidates:
            return (
                "No teammate suggestions found — the knowledge graph may not have real "
                "usage-stats/type data for these Pokemon yet."
            )
        return result.model_dump_json()

    async def _predict_win_probability(
        team_a_pokemon_names: list[str], team_b_pokemon_names: list[str]
    ) -> str:
        team_a = Team(members=[PokemonSet(species_id=to_id_str(n)) for n in team_a_pokemon_names])
        team_b = Team(members=[PokemonSet(species_id=to_id_str(n)) for n in team_b_pokemon_names])
        try:
            result = await predict_win_probability_tool(db, team_a, team_b)
        except ModelUnavailableError as exc:
            return f"Couldn't compute a win probability: {exc}"
        return result.model_dump_json()

    return [
        StructuredTool.from_function(
            coroutine=_get_pokemon_profile,
            name="get_pokemon_profile",
            description=(
                "Look up a Pokemon's base stats, types, abilities, movepool, "
                "sprite_url, and site_path (/pokedex/{id}). Use whenever the user "
                "asks about a Pokemon or wants a link to its Master Ball page. "
                "Also use before calculate_damage if you need typing/abilities/stats."
            ),
            args_schema=PokemonProfileInput,
        ),
        StructuredTool.from_function(
            coroutine=_calculate_damage,
            name="calculate_damage",
            description=(
                "Calculate the min/max damage and KO chance of one Pokemon's move against "
                "another, assuming a standard 252 offensive/252 defensive EV spread unless "
                "told otherwise. Use this for any 'does X beat Y' or 'does move Z KO' question."
            ),
            args_schema=DamageCalcInput,
        ),
        StructuredTool.from_function(
            coroutine=_retrieve_context,
            name="retrieve_context",
            description=(
                "Search the competitive strategy knowledge base for team-building advice, "
                "common checks/counters, teammates, and archetype/mechanic explanations. Use "
                "this for 'why', 'what beats', or general strategy questions."
            ),
            args_schema=RetrieveContextInput,
        ),
        StructuredTool.from_function(
            coroutine=_lookup_meta_stats,
            name="lookup_meta_stats",
            description=(
                "Look up a Pokemon's real, current ladder usage stats: usage rank/percent, "
                "most common ability/item/moves/Tera type, top teammates, and top checks & "
                "counters — synced from Smogon's own published usage stats, not an estimate. "
                "Use this for 'what set does X actually run' or 'how common is X' questions."
            ),
            args_schema=MetaStatsInput,
        ),
        StructuredTool.from_function(
            coroutine=_scout_opponent,
            name="scout_opponent",
            description=(
                "Get a combined scouting report on an opposing Pokemon: its real usage stats "
                "(likely set/teammates) plus relevant strategy notes on how to beat it. Use "
                "this when the user asks how to prepare for or play against a specific "
                "opposing Pokemon."
            ),
            args_schema=ScoutOpponentInput,
        ),
        StructuredTool.from_function(
            coroutine=_suggest_teammates,
            name="suggest_teammates",
            description=(
                "Given the user's current team, suggest teammates using a knowledge-graph "
                "traversal of real ladder usage-stats co-occurrence and type-weakness "
                "coverage — returns candidates with the real data-backed reason for each "
                "(a usage-stats pairing or a type resist). Use this for 'who should I add "
                "to my team' or 'what pairs well with X' questions."
            ),
            args_schema=SuggestTeammatesInput,
        ),
        StructuredTool.from_function(
            coroutine=_predict_win_probability,
            name="predict_win_probability",
            description=(
                "Estimate the win probability of team A vs team B using a locally-trained "
                "XGBoost model over team-composition features (average stats, type diversity, "
                "type-matchup coverage). This is a toy/demonstration model trained on a "
                "synthetic simulator, not real logged match data — always caveat the result as "
                "an estimate, not a guaranteed outcome, when relaying it. Use this only if the "
                "user explicitly asks for a win-probability estimate between two teams."
            ),
            args_schema=WinProbabilityInput,
        ),
    ]


__all__ = ["build_agent_tools"]
