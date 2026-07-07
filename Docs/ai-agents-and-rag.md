# AI Agents, RAG, and MCP — Deep Dive

This doc covers the part of the stack that's the actual point of the project: the agent graph, the retrieval pipeline, the MCP server, and how eval/observability closes the loop between them.

## 1. Agent graph (LangGraph)

Keep this small and legible. Start with a single graph:

```
entry → router → {tool_calls in parallel} → synthesizer → END
                                  ↓ (if router decides more info needed)
                              clarify_node → (back to user)
```

**Nodes:**
- `router` — cheap/fast model call (OpenAI's smallest/fastest tier) classifies the turn: `pokedex_question | team_analysis | damage_calc | replay_review | meta_question | tournament_prep | post_loss_review | general_rag | needs_clarification`.
- `tool_calls` — one or more of the tools below, invoked based on the router's decision. Run independent tool calls concurrently (`asyncio.gather`), not sequentially.
- `clarify_node` — only reached when the router can't confidently resolve intent (e.g., "is my team good?" with no team specified) — asks a targeted follow-up instead of guessing.
- `synthesizer` — the expensive model call (Claude by default, chosen by task type) that turns tool outputs + retrieved context into the final grounded response, with citations back to source documents where RAG was used.

**Model routing rule of thumb** (multi-vendor routing, matches the dominant real-world enterprise pattern — see [`tech-stack.md`](./tech-stack.md#cloud-and-model-provider-decision-revisited) for the data behind this table):
| Task | Model |
|---|---|
| Intent routing / classification | OpenAI (small/fast tier) |
| Standard synthesis / most chat turns, replay postmortems, long tournament-report synthesis | Claude (via Bedrock) — this is the "complex reasoning" leg of the industry's most common multi-provider pattern |
| Multimodal input (screenshotted team sheet/board state), bulk/cheap ingestion of large PDF corpora | Gemini |
| Fallback if primary provider errors/rate-limits | Whichever of the above isn't already in the chain for that call |

**Explicit non-goal:** don't grow this into a 15-node graph to look impressive. Add a node only when a real product requirement forces a new branch. Being able to justify *why the graph is shaped the way it is* is worth more in an interview than graph complexity.

## 2. Tools (shared across agent, REST, and MCP)

Each tool is a plain Python callable with a Pydantic input/output model, so the exact same implementation is exposed three ways (see [`architecture.md`](./architecture.md)).

| Tool | Input | Output | Notes |
|---|---|---|---|
| `get_pokemon_profile` | Pokémon name/id | base stats, full movepool, abilities, type matchups/weaknesses, natures reference, tournament usage % (once Phase 5 lands), and any Mega Evolution formes' full profiles nested inline | **Deterministic lookup, no LLM.** This is the Pokédex tool — backs the standalone Pokédex UI directly (Phase 1) *and* is callable by the agent, so "tell me about Landorus-Therian" gets the same underlying data as browsing the Pokédex page, just reasoned over in prose. Mega-awareness is folded in here rather than being a separate tool, since it's the same species lookup with one extra branch — directly fixes an official, dev-acknowledged complaint that Pokémon Champions doesn't surface this anywhere in-game (see [`product-research.md`](./product-research.md)). Implementation note: no `held_item` input as originally sketched — `poke-env`'s data doesn't include items, and always surfacing every available Mega forme unconditionally is both simpler and closer to the actual product goal (pre-computed, always-visible Mega stats) than gating it behind a held-item match. |
| `calculate_damage` | attacker, defender, move, field conditions | min/max damage, KO chance, roll breakdown | **Deterministic, no LLM.** A from-scratch Gen 9 formula implementation, hand-verified against known-correct values (see [`backend/damage-calc.md`](./backend/damage-calc.md) for exact scope/known limitations). This is the tool most worth having exhaustive `pytest` coverage on. |
| `analyze_team` | team (6 Pokémon + sets) | type-coverage matrix, speed tiers, weaknesses, role-compression flags | Deterministic + rule-based; no LLM needed to compute, though the agent explains the output in natural language. |
| `lookup_meta_stats` | format, Pokémon or archetype | usage %, common sets/spreads, common teammates | Backed by ingested Pikalytics-style usage data in Postgres. |
| `retrieve_context` | natural-language query, source filter | top-k chunks + citations | The RAG tool — see section 3. |
| `parse_replay` | replay log/URL | structured turn-by-turn game state | **Pokémon Showdown replays specifically** (Phase 5) — Showdown exposes clean text logs today. Runs as a background job (Arq) for anything non-trivial in length; the agent queries the *result*, not the raw log. The equivalent for official Pokémon Champions matches requires video/multimodal input instead of a log, since Champions has no replay export — that's the deferred `analyze_battle_video` Premium tool (Phase 7), not this one. |
| `scout_opponent` | known team fragments / player history | inferred likely team + counter-suggestions | Combines `lookup_meta_stats` + `retrieve_context`; a genuinely agentic multi-tool composition, good demo material. |
| `log_battle_result` | win/loss, timestamp, optional team id | updated session record | Powers the Mental-Game Coach (Phase 3). Deterministic; triggers `check_tilt_risk` as a side effect, not an LLM call. |
| `check_tilt_risk` | recent session history | streak length, "two-loss rule" nudge flag | Deterministic rule (the community's own documented "two-loss rule" — see [`product-research.md`](./product-research.md)), evaluated after every `log_battle_result` call. When it fires, triggers a Web Push notification (browser Push API/service worker — see [`tech-stack.md`](./tech-stack.md#mobile--distribution)) — this is one of the few places the system initiates contact with the user rather than responding to a request. |

## 3. RAG pipeline

```
raw sources → LlamaIndex loaders/parsers → chunking → embedding → pgvector
                                                                      ↓
                                                          retrieve_context tool
```

**Sources to ingest, roughly in build order:**
1. Smogon strategy dex pages/analyses (HTML → clean text)
2. Usage/meta stats exports (structured, not really "RAG" so much as a lookup table — goes to relational tables, not vectors)
3. VGC/regional tournament reports and public team sheets (PDF/text parsing — this is where LlamaIndex's node parsers earn their keep)
4. Replay logs (structured, parsed output feeds the agent directly rather than going through vector retrieval)
5. ROM hack mechanic docs, if/when that scope is tackled

**Why LlamaIndex specifically here (vs. hand-rolled chunking):** tournament reports and Smogon pages are genuinely messy, heterogeneous documents (tables, prose, move lists). LlamaIndex's node parsers and metadata extraction are built exactly for this, and it's the named 2026 complement to LangChain/LangGraph specifically for retrieval-heavy products — see [`tech-stack.md`](./tech-stack.md).

**Grounding discipline:** every RAG-sourced claim in a synthesized response carries a citation back to its source chunk (title + link/reference). This is a cheap, high-value pattern to implement early — "grounded, cited advice" is explicitly part of the product pitch, not just a RAG-101 nicety.

## 4. MCP server

A standalone server (official MCP Python SDK) exposing the tools from section 2 — likely a useful subset (`get_pokemon_profile`, `calculate_damage`, `analyze_team`, `lookup_meta_stats`) rather than all of them, since some (like `parse_replay`) are async/job-shaped and less natural as a synchronous MCP tool call at first. `get_pokemon_profile` in particular is a good MCP citizen: a fast, synchronous, deterministic lookup with no side effects, so any MCP client (Claude Desktop, Cursor) can ask "what's Landorus-Therian's profile" and get a real answer with zero extra plumbing.

**Build checklist** (matches what current hiring research flags as the credibility bar for this artifact):
- [ ] Typed schemas via Pydantic for every tool's input/output
- [ ] Clean, LLM-legible tool descriptions (the tool description *is* the API contract an LLM reads — treat it like documentation, not a code comment)
- [ ] Both `stdio` and Streamable HTTP transports supported
- [ ] Basic auth (API key) on the HTTP transport
- [ ] Tested against the official MCP Inspector tool
- [ ] Short README documenting architecture, failure modes, and how to run/test it locally — this README is itself portfolio material, separate from the main project docs

**Stretch:** multi-server composition — configure a client that talks to the DexTrAIner MCP server *and* another public MCP server (e.g., a filesystem or fetch server) simultaneously, and document how capability conflicts are handled. This is explicitly called out in 2026 research as a strong, rare signal.

**Not pursued, and why (worth being able to say in an interview):** Google's Agent2Agent (A2A) protocol — MCP's now-official complement for *agent-to-agent* delegation, as opposed to MCP's *agent-to-tool* scope, both now under the same Linux Foundation governance (see [`tech-stack.md`](./tech-stack.md#ai--agents)) — isn't used here because DexTrAIner's graph is one agent composing many tools, not multiple peer agents delegating tasks to each other. That's a deliberate scope call, not a gap: A2A would earn a place if the graph ever split into genuinely independent specialist agents (e.g., a Replay-Analysis agent handing a finished report to a separate Team-Doctor agent).

## 5. Evaluation & observability loop

```
production traffic → LangSmith / Langfuse traces → flag failures/low-quality turns
                                                              ↓
                                              add to golden eval dataset (JSONL, in git)
                                                              ↓
                                  RAGAS (RAG metrics) + promptfoo (regression/red-team) in CI
                                                              ↓
                                          PR blocked if a change regresses against golden set
```

**Golden dataset format:** plain JSONL, checked into the repo (`eval/golden/*.jsonl`), tool-neutral — so it's not locked to whichever eval tool is in use this quarter. Each entry: input, expected behavior/answer shape, and (for RAG entries) the source chunks that should be retrieved.

**RAGAS metrics to track first:** faithfulness (is the answer actually supported by retrieved context?), context precision/recall (is retrieval finding the right chunks?), answer relevance.

**promptfoo use cases:** side-by-side comparison when changing a prompt or swapping models (Claude vs. OpenAI vs. Gemini on the same synthesis prompt), plus basic red-teaming (prompt injection via a malicious "team name" or replay-log field — a real attack surface here since user-supplied text flows into prompts).

**LangSmith vs. Langfuse, concretely:** run LangSmith as the default (lowest friction given the LangChain/LangGraph-native stack). Stand up Langfuse at least once, self-hosted, specifically to be able to compare trace quality, pricing model, and self-hosting operational cost firsthand — this is a common interview question ("why would you pick one over the other") that's much stronger answered from direct experience than from a blog post.
