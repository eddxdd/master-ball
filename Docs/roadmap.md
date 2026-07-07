# Roadmap

Phased so that each phase ships something demoable and maps to a specific set of skills worth being able to talk about in an interview. Don't start a later phase's tooling before the current phase's core loop actually works end-to-end — a small working thing beats a half-built ambitious thing.

> **Scope note:** phases below reflect the narrowed product scope in [`product-research.md`](./product-research.md) — the two flagship v1 features are the **Conversational Team Doctor** (Phase 2) and the **Mental-Game Coach** (Phase 3), not "clone every feature of every existing tool." The AI video/battle-postmortem feature (analyzing a user-uploaded recording of a Pokémon Champions match, since that game has no replay export) is explicitly a **Premium/stretch feature** in Phase 7, not core scope — it's the most differentiated idea from the research but also the most expensive to build well.
>
> **Platform note:** the whole build targets a single website, shipped as an installable PWA — there is no committed native/Google Play app anywhere in Phases 0–6. Native packaging (Capacitor) is explicitly optional and lives only in Phase 7, alongside a separate, unrelated on-device/edge-AI stretch item. See [`tech-stack.md`](./tech-stack.md#mobile--distribution) for the full reasoning.

## Phase 0 — Foundations
**Goal:** empty-but-real skeleton, deployed.

- Repo structure: `Frontend/`, `Backend/`, `Docs/` (this doc set)
- FastAPI app with health check, Postgres connection, Alembic migrations set up
- React app scaffolded (Vite + TS + Tailwind + shadcn/ui), talking to the health check endpoint via TanStack Query
- PWA basics wired in (`vite-plugin-pwa`: web app manifest + service worker) — this is the only mobile-distribution mechanism planned; see [`tech-stack.md`](./tech-stack.md#mobile--distribution) for why a native/Capacitor wrapper is an optional stretch item, not a Phase 0 commitment
- Docker Compose for local dev (Postgres w/ pgvector, Valkey, API, frontend)
- GitHub Actions: lint + typecheck + basic pytest/Vitest running on PR
- Deployed skeleton to AWS (ECS/Fargate or App Runner, staging)

**Skills demonstrated:** modern full-stack scaffolding, Docker, CI basics, cloud deploy from day one.

## Phase 1 — Core product, no AI yet
**Goal:** team import + deterministic analysis works, fully tested, before any LLM is involved.

- Team import (Showdown export format parser)
- `calculate_damage` tool — ported/verified damage formulas, exhaustively unit-tested against known-correct values, with `pytest-benchmark` asserting sub-100ms response from day one (see [`tech-stack.md`](./tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)) — this tool is a core product pillar competing against established calculator apps, not a placeholder
- `analyze_team` tool — type coverage, speed tiers, weakness matrix
- **Mega-aware Pokédex** — the cheap, high-goodwill quick win from the research: pre-compute and display Mega Evolution stat/ability changes, since Pokémon Champions itself doesn't show this anywhere before you actually mega evolve in a real match
- Frontend: team builder/import UI, analysis results view — held to the same "feels instant" bar as the best native calculator apps, not just "functionally correct"
- Auth (basic email/password or OAuth)

**Skills demonstrated:** you can ship a correct, well-tested, *fast*, non-AI feature that stands on its own against established competitors — this matters both as a product foundation and because it proves the LLM layer is used where it adds value, not as a crutch to cover for a weak core product.

## Phase 2 — Conversational Team Doctor (RAG + first agent)
**Goal:** the flagship "ask anything, reasoned and grounded" experience works — this is the actual differentiator, not a generic RAG demo.

- Ingest first knowledge base slice: Smogon strategy dex pages via LlamaIndex loaders/parsers → pgvector
- `retrieve_context` tool, with citations
- First LangGraph agent: router → tool_calls → synthesizer, wired to Claude via Amazon Bedrock (with OpenAI as the router-step provider)
- Agent composes `calculate_damage` + `analyze_team` + `retrieve_context` to answer real matchup questions in plain English ("lead with X because...") rather than surfacing a bare number grid — this is the specific behavior that differentiates this from every existing calculator-with-an-AI-button competitor (see [`product-research.md`](./product-research.md))
- Streaming responses over WebSocket
- LangSmith wired up for tracing from day one of the agent existing

**Skills demonstrated:** LangGraph, LangChain, Bedrock/Claude integration, multi-provider routing, pgvector RAG, streaming, LlamaIndex ingestion.

## Phase 3 — Mental-Game Coach
**Goal:** the second flagship feature — the one genuinely zero-competitor gap found in research. Turns DexTrAIner from "a tool that answers questions" into "a coach that pays attention to how you're doing."

- Session/battle-result tracking: log win/loss + timestamp per session (manually logged by the user at first — no live game-state access is assumed or required)
- Loss-streak detection implementing the community's own "two-loss rule" (see [`product-research.md`](./product-research.md)): after 2 consecutive losses, trigger a nudge
- Push notifications via the browser's Web Push API (VAPID keys, delivered through the PWA's service worker — no native app or third-party push SDK needed) — "you've lost 2 in a row, want a break or a quick postmortem instead of queuing again?"
- Post-loss explanation flow: agent composes `analyze_team` + `calculate_damage` + the logged battle summary into a plain-English "here's specifically why this game went the way it did," targeting the exact tilt-trigger the research identified ("losing to something you don't understand feels random and unfair; understanding it makes it feel solvable")
- Frontend: a lightweight session/mood check-in surface, notification permission flow

**Skills demonstrated:** proactive/event-driven product design (not just request-response), Web Push/service-worker integration, a genuinely novel feature grounded in real user research rather than a copied competitor feature — good interview material specifically because it didn't come from "what does the market already have."

## Phase 4 — Eval loop + MCP server
**Goal:** close the quality loop, and ship the standout portfolio artifact.

- Golden eval dataset (JSONL) seeded from manual testing + early real usage
- RAGAS metrics running in CI against the golden set
- promptfoo regression + basic red-team suite in CI, gating PRs
- Langfuse stood up (self-hosted) alongside LangSmith, to compare directly
- Standalone MCP server exposing `calculate_damage`, `analyze_team`, `lookup_meta_stats`, tested with the official MCP Inspector, with its own README

**Skills demonstrated:** LLM eval methodology (RAGAS/promptfoo), production observability trade-offs (LangSmith vs. Langfuse), MCP server authoring — currently the single highest-signal addition per 2026 hiring research.

## Phase 5 — Meta stats, Showdown replay coach, background jobs
**Goal:** the harder, async, multi-step features, scoped to what's actually buildable today.

- Arq worker setup, backed by Valkey (Amazon ElastiCache for Valkey — see [`tech-stack.md`](./tech-stack.md#backend) for why Valkey, not Redis)
- Meta/usage stats scraping + sync job, feeding `lookup_meta_stats` — **scheduled/batched, not fetched live per-request** (see [`tech-stack.md`](./tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)), leaning on existing public tournament/usage data sources rather than re-deriving everything from scratch
- Replay log parser (background job) → structured turn-by-turn state, **for Pokémon Showdown replays specifically** (OU/singles audience) — Showdown exposes clean text logs today; official Pokémon Champions currently does not (see [`product-research.md`](./product-research.md)), which is why the Champions-specific video version of this feature is deferred to Phase 7 instead of built here
- Replay Coach agent flow: postmortem synthesis via Claude (long-document/complex reasoning), with per-turn commentary
- `scout_opponent` tool composing `lookup_meta_stats` + `retrieve_context`
- First real use of Gemini as the multimodal specialist: accept a screenshotted team sheet as input

**Skills demonstrated:** background job architecture, multi-provider model routing (Claude/OpenAI/Gemini by task type), multi-tool agentic composition, working with real messy third-party/scraped data, cost-aware data-ingestion design.

## Phase 6 — AI-assisted Team Builder and GraphRAG (Neo4j)
**Goal:** take the Team Builder (core since Phase 1 as a manual tool) the rest of the way to genuinely competitive with ChampTeams/ChampionsMeta, powered by a differentiated, harder-to-copy retrieval technique.

- Neo4j knowledge graph: Pokémon ↔ types ↔ moves ↔ abilities ↔ items ↔ common archetypes
- Graph-traversal queries feeding the agent for "what counters X core" style questions, combined with vector RAG (GraphRAG pattern)
- AI-assisted Team Builder: given a target meta or a specific matchup, propose team candidates (heuristics + stats + LLM reasoning over graph + RAG context) — this is the pillar 1 category from [`README.md`](./README.md#core-product-pillars) reaching feature parity-and-beyond with the established competitors, not a new side feature

**Skills demonstrated:** GraphRAG (genuinely current, differentiated technique), a case study of *when* to combine graph + vector retrieval instead of picking one.

## Phase 7 — Premium features and stretch goals
**Goal:** the features that were deliberately deferred, plus polish work that only makes sense once there's real feature depth to show for it. Everything in this phase is genuinely optional and unordered relative to each other — pick based on time available and what's most useful to have written up for a given interview.

1. **AI Battle Postmortem for Pokémon Champions (Premium)** — the single most differentiated idea from the research, and the most expensive: user uploads a screen recording they already made of a Champions match (no live capture, no in-app recording — that's explicitly out of scope); Gemini's multimodal/video understanding reconstructs the turn-by-turn battle; the agent coaches the postmortem the same way the Showdown-log-based Replay Coach does in Phase 5. Gated as Premium specifically because the compute cost (video-understanding API calls) is real and per-use, unlike the mostly-cached/batched core product.
2. **On-device/edge AI demo (WebGPU + Transformers.js/WebLLM)** — a small local model running entirely client-side (e.g., an instant mood/tilt signal on a post-loss note, with no network round-trip), as a deliberate, separate showcase of the on-device/edge-inference skill category that's genuinely hot in 2026 AI hiring — see [`tech-stack.md`](./tech-stack.md#on-deviceedge-ai-optional-stretch--see-roadmapmd). Entirely browser-based; doesn't depend on item 3 below at all.
3. **Native app packaging (Capacitor) + Google Play submission — optional, unscheduled** — demoted from a planned deliverable to a true "only if there's spare time and it still sounds fun" stretch item. See [`tech-stack.md`](./tech-stack.md#mobile--distribution) for the full reasoning: it doesn't teach an AI skill, it adds real recurring store-maintenance overhead, and 2026 research turned up two independent reasons to be cautious about it specifically for this app (Google Play's policy tightening around "AI companion apps," and PWAs now out-converting Play Store listings on install rate anyway). If pursued: wrap the existing PWA in Capacitor, add push/camera native plugins, and don't submit until there's real feature depth to show (thin-wrapper apps are a known rejection risk).
4. **Multi-cloud deploy** — same Docker containers redeployed to Google Cloud Run, model calls routed through Vertex AI. Not needed for the product; needed so you can speak concretely to GCP/Vertex AI experience (useful if a Google-shaped role comes up) even though AWS is primary here because it's the broader/more-requested market skill.
5. **XGBoost win-probability model** — tabular model over structured battle/team-composition stats, served alongside the LLM-based analysis, with a clear written rationale for why this task uses classical ML instead of an LLM call.
6. **Multi-server MCP composition** — the DexTrAIner MCP server plus a second public MCP server (e.g., fetch/filesystem) used together from one client, with documented notes on capability-conflict handling.
7. **Kubernetes (EKS)** — only if a concrete limitation of ECS/Fargate is actually hit; otherwise, the fact that it was deliberately *not* adopted, and why, is itself a fine thing to say in an interview.
8. **Playwright E2E suite** covering the full "import team → get analysis → ask a follow-up in chat → get a cited answer" flow.

## How to use this roadmap in a job search

Each phase boundary is a natural point to write a short technical post (or resume bullet) about what was built and why — the "why" matters more than the "what" for interview purposes. Suggested checkpoints to write about:
- End of Phase 2: "Why pgvector + LlamaIndex instead of a dedicated vector DB" and "designing a coach that explains itself, not just a calculator with an LLM bolted on"
- End of Phase 3: "Building a feature nobody asked for by name, because the research pointed at it anyway" — the Mental-Game Coach is good material specifically because it came from synthesizing scattered pain points, not a feature request
- End of Phase 4: "Building an MCP server: what I learned" — this one specifically doubles as public MCP-ecosystem contribution material
- End of Phase 5: "Routing between Claude, OpenAI, and Gemini by task type"
- End of Phase 6: "When GraphRAG actually beats plain vector RAG"
- End of Phase 7: "Why I built this as a PWA and deliberately didn't ship a native app" — a good, slightly contrarian portfolio note precisely because it argues *against* the more common instinct, backed by real research rather than just "it was easier"
