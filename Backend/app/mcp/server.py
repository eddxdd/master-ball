"""The standalone MCP server (Phase 4) — see app/mcp/README.md for the full
architecture writeup and Docs/ai-agents-and-rag.md section 4 for the product
rationale.

Exposes a useful subset of this app's existing deterministic tools
(get_pokemon_profile, calculate_damage, analyze_team) to any MCP client
(Claude Desktop, Cursor, the official MCP Inspector) — the *same*
app/tools/* implementations the REST API and the LangGraph agent already
use, per Docs/architecture.md's "one implementation, three surfaces" rule.
This module only adds the MCP tool-schema/wiring on top; it never
reimplements lookup/calculation logic.

parse_replay/the Replay Coach flow are deliberately not exposed here — they
call out to Showdown's own replay API and (for the coach) run the full agent
graph, which don't fit this server's "fast, synchronous, side-effect-free
lookup" scope the same way get_pokemon_profile/calculate_damage/analyze_team/
lookup_meta_stats/scout_opponent do. Nothing here writes to the database.

Each tool opens its own short-lived AsyncSession (via AsyncSessionLocal) for
the duration of a single call, rather than sharing one session across calls
the way a single HTTP request would — an MCP server has no natural
per-request boundary to hang a session off, and a fresh session per call is
simpler and just as correct for the read-only lookups this module exposes.
"""

from typing import Annotated, Literal

from poke_env.data.normalize import to_id_str
from pydantic import BaseModel, Field

from app.db.session import AsyncSessionLocal
from app.graph.session import GraphUnavailableError
from app.schemas.calculator import (
    DamageCalcRequest,
    DamageCalcResult,
    FieldConditions,
    PokemonBattleState,
)
from app.schemas.graph import TeamSuggestionResult
from app.schemas.meta import MetaStatsResult, ScoutReport
from app.schemas.ml import WinProbabilityResult
from app.schemas.pokemon import PokemonProfile
from app.schemas.team import PokemonSet, Team, TeamAnalysis
from app.tools.damage_calc import DamageCalcError
from app.tools.damage_calc import calculate_damage as _calculate_damage
from app.tools.graph_query import suggest_teammates as _suggest_teammates
from app.tools.meta_stats import DEFAULT_FORMAT
from app.tools.meta_stats import lookup_meta_stats as _lookup_meta_stats
from app.tools.pokedex import get_pokemon_profile as _get_pokemon_profile
from app.tools.scout import scout_opponent as _scout_opponent
from app.tools.team_analysis import analyze_team as _analyze_team
from app.tools.win_probability import ModelUnavailableError
from app.tools.win_probability import predict_win_probability as _predict_win_probability

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as exc:  # pragma: no cover - guarded import, see app/mcp/README.md
    raise ImportError(
        "The 'mcp' package isn't installed. It's a core dependency (see "
        "Backend/pyproject.toml) — run `uv sync` from Backend/."
    ) from exc

mcp_server = FastMCP(
    name="masterball",
    instructions=(
        "Tools for competitive Gen 9 Pokemon: look up a Pokemon's real stats/movepool/"
        "type matchups, calculate exact battle damage between two Pokemon, analyze a full "
        "6-Pokemon team's type coverage and weaknesses, look up a Pokemon's real current "
        "ladder usage stats, get a combined scouting report on an opponent, suggest "
        "teammates via a knowledge-graph traversal of usage-stats co-occurrence and type "
        "coverage, and estimate a team-vs-team win probability with a small XGBoost model "
        "(a toy/demo model — see its own tool description for the synthetic-training-data "
        "caveat). The first six are deterministic lookups/calculations/graph traversals "
        "backed by a real seeded database, synced usage-stats table, or Neo4j graph — "
        "never an LLM guessing numbers."
    ),
)


class DamageCalcToolInput(BaseModel):
    attacker_species_id: str = Field(
        description="The attacking Pokemon's name or forme, e.g. 'Landorus-Therian'."
    )
    defender_species_id: str = Field(description="The defending Pokemon's name or forme.")
    move_id: str = Field(description="The move being used, e.g. 'Earthquake'.")
    attacker_item: str | None = Field(default=None, description="The attacker's held item, if any.")
    attacker_ability: str | None = Field(
        default=None, description="Override the attacker's ability."
    )
    attacker_tera_type: str | None = Field(
        default=None, description="The attacker's Tera type, if Terastallized."
    )
    defender_item: str | None = Field(default=None, description="The defender's held item, if any.")
    defender_ability: str | None = Field(
        default=None, description="Override the defender's ability."
    )
    defender_tera_type: str | None = Field(
        default=None, description="The defender's Tera type, if Terastallized."
    )
    weather: Literal["sun", "rain"] | None = Field(
        default=None, description="'sun' or 'rain', if active."
    )
    is_critical: bool = Field(default=False, description="Whether the hit is a critical hit.")


@mcp_server.tool(
    name="get_pokemon_profile",
    description=(
        "Look up a Pokemon's real base stats, full Gen 9 movepool, abilities, computed "
        "type matchups, and (if it has one) Mega Evolution forme data. Deterministic — "
        "backed by a real seeded database, not an LLM guessing. Use this to confirm a "
        "Pokemon's typing/stats/abilities before reasoning about a matchup."
    ),
)
async def get_pokemon_profile(
    pokemon_name: Annotated[
        str, Field(description="A Pokemon or forme name, e.g. 'Landorus-Therian'.")
    ],
) -> PokemonProfile:
    async with AsyncSessionLocal() as db:
        profile = await _get_pokemon_profile(db, to_id_str(pokemon_name))
    if profile is None:
        raise ValueError(f"No Pokemon found matching '{pokemon_name}'.")
    return profile


@mcp_server.tool(
    name="calculate_damage",
    description=(
        "Calculate the exact min/max damage range and KO chance of one Pokemon's move "
        "against another, using this app's from-scratch Gen 9 damage formula (stat "
        "calc, STAB, Terastallization, weather, crits). Use this for any 'does X beat "
        "Y' or 'does move Z KO' question — never estimate damage numbers yourself."
    ),
)
async def calculate_damage(input: DamageCalcToolInput) -> DamageCalcResult:
    request = DamageCalcRequest(
        attacker=PokemonBattleState(
            species_id=to_id_str(input.attacker_species_id),
            evs={"atk": 252, "spa": 252},
            item=to_id_str(input.attacker_item) if input.attacker_item else None,
            ability=to_id_str(input.attacker_ability) if input.attacker_ability else None,
            tera_type=input.attacker_tera_type.capitalize() if input.attacker_tera_type else None,
        ),
        defender=PokemonBattleState(
            species_id=to_id_str(input.defender_species_id),
            evs={"hp": 252, "def": 252, "spd": 252},
            item=to_id_str(input.defender_item) if input.defender_item else None,
            ability=to_id_str(input.defender_ability) if input.defender_ability else None,
            tera_type=input.defender_tera_type.capitalize() if input.defender_tera_type else None,
        ),
        move_id=to_id_str(input.move_id),
        field=FieldConditions(weather=input.weather, is_critical=input.is_critical),
    )
    async with AsyncSessionLocal() as db:
        try:
            result = await _calculate_damage(db, request)
        except DamageCalcError as exc:
            raise ValueError(str(exc)) from exc
    if result is None:
        raise ValueError(
            f"Couldn't find '{input.attacker_species_id}', '{input.defender_species_id}', "
            f"or the move '{input.move_id}'."
        )
    return result


@mcp_server.tool(
    name="analyze_team",
    description=(
        "Analyze a full 6-Pokemon team's type-coverage matrix, speed tiers, weakness "
        "matrix, and simple heuristic role-compression flags (e.g. shared weaknesses, "
        "missing a strong attacker). Deterministic and rule-based — no LLM needed to "
        "compute this, only to explain it in prose afterward."
    ),
)
async def analyze_team(team: Team) -> TeamAnalysis:
    async with AsyncSessionLocal() as db:
        return await _analyze_team(db, team)


@mcp_server.tool(
    name="lookup_meta_stats",
    description=(
        "Look up a Pokemon's real, current ladder usage stats: usage rank/percent, most "
        "common ability/item/moves/Tera type, top teammates, and top checks & counters — "
        "synced from Smogon's own published usage stats (scripts/sync_usage_stats.py), not "
        "an estimate. Use this for 'what set does X actually run' or 'how common is X'."
    ),
)
async def lookup_meta_stats(
    pokemon_name: Annotated[str, Field(description="A Pokemon or forme name, e.g. 'Kingambit'.")],
    format: Annotated[str, Field(description="Smogon format id, e.g. 'gen9ou'.")] = DEFAULT_FORMAT,
) -> MetaStatsResult:
    async with AsyncSessionLocal() as db:
        result = await _lookup_meta_stats(db, to_id_str(pokemon_name), format)
    if result is None:
        raise ValueError(
            f"No synced usage stats for '{pokemon_name}' in format '{format}' — the sync job "
            "may not have run yet, or this isn't a real Pokemon in that format."
        )
    return result


@mcp_server.tool(
    name="scout_opponent",
    description=(
        "Get a combined scouting report on an opposing Pokemon: its real usage stats "
        "(likely set/teammates) plus relevant strategy notes on how to beat it. Use this "
        "when preparing for or reasoning about an opposing Pokemon."
    ),
)
async def scout_opponent(
    pokemon_name: Annotated[str, Field(description="The opposing Pokemon to scout.")],
    format: Annotated[str, Field(description="Smogon format id, e.g. 'gen9ou'.")] = DEFAULT_FORMAT,
) -> ScoutReport:
    async with AsyncSessionLocal() as db:
        return await _scout_opponent(db, pokemon_name, format)


@mcp_server.tool(
    name="suggest_teammates",
    description=(
        "Given a partial team (1-5 Pokemon), suggest teammates via a Neo4j knowledge-graph "
        "traversal of real ladder usage-stats co-occurrence (which Pokemon are actually "
        "played together) and type-weakness coverage (which types resist what the team is "
        "weak to). Each candidate includes the real graph-derived reason it was suggested. "
        "Use this for 'who should I add to my team' or 'what pairs well with X' questions."
    ),
)
async def suggest_teammates(
    team_pokemon_names: Annotated[
        list[str], Field(description="The current team's Pokemon names/formes (1-5 of them).")
    ],
) -> TeamSuggestionResult:
    team_ids = [to_id_str(name) for name in team_pokemon_names]
    try:
        return await _suggest_teammates(team_ids)
    except GraphUnavailableError as exc:
        raise ValueError(str(exc)) from exc


@mcp_server.tool(
    name="predict_win_probability",
    description=(
        "Estimate the win probability of team A vs team B using a locally-trained XGBoost "
        "model over team-composition features (average stats, type diversity, type-matchup "
        "coverage). TOY/DEMO MODEL: trained on a documented synthetic battle-outcome "
        "simulator, not real logged match data (see app/tools/win_probability.py) — always "
        "caveat the result as an estimate from a demonstration model, never as a guaranteed "
        "or validated real-match prediction."
    ),
)
async def predict_win_probability(
    team_a_pokemon_names: Annotated[list[str], Field(description="Team A's Pokemon names/formes.")],
    team_b_pokemon_names: Annotated[list[str], Field(description="Team B's Pokemon names/formes.")],
) -> WinProbabilityResult:
    team_a = Team(members=[PokemonSet(species_id=to_id_str(n)) for n in team_a_pokemon_names])
    team_b = Team(members=[PokemonSet(species_id=to_id_str(n)) for n in team_b_pokemon_names])
    async with AsyncSessionLocal() as db:
        try:
            return await _predict_win_probability(db, team_a, team_b)
        except ModelUnavailableError as exc:
            raise ValueError(str(exc)) from exc


__all__ = ["mcp_server"]
