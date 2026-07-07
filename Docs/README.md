# DexTrAIner — Docs

> **Naming status: working title, not final.** "DexTrAIner" is a placeholder we're building under for now — see [Naming & branding](#naming--branding) below for how the codebase should reference it so a rename later is a five-minute job, not a refactor.

DexTrAIner is two things in one name, both held to a "best in class" bar: the **Dex** — a genuinely excellent, fast, accurate Pokédex, Team Builder, and Damage Calculator (a proven, in-demand category — see [`product-research.md`](./product-research.md)) — and the **TrAIner** — an AI layer on top that reasons in plain English about a team/matchup instead of just showing numbers, and helps with the mental-game side of laddering that every existing tool ignores. Neither half is the "real" product with the other bolted on: the Dex has to be excellent on its own merits, and the AI has to be a genuine value-add on top of it, not a thin wrapper around a calculator. Being successful here was never about being the only tool in the category — it's about doing the job better than what exists, on every axis, including raw performance.

> **Product scope note:** the original one-liner above (and the six "pillars" this doc used to list) came from an initial ChatGPT-generated concept and an early, under-researched pass. It's since been replaced by [`product-research.md`](./product-research.md) — real research into what competitive Pokémon players are actually frustrated by (Reddit, Smogon forums, official Pokémon forums, existing app reviews), what's already been built by others, and where the real, validated, multi-person gap is. Read that doc for the reasoning behind the "Core product pillars" section below.

## Why this project exists

Two goals, in order:

1. **Learning vehicle for AI engineering.** The primary objective is to build hands-on depth with the tools and patterns that Canadian/US companies are actually hiring for in 2026: agent orchestration (LangGraph/LangChain), retrieval-augmented generation, the Model Context Protocol (MCP), structured tool-calling, evaluation/observability pipelines, and cloud-native deployment. Every architectural choice below is optimized for **learning the popular thing well and being able to speak to trade-offs in an interview**, not for using what's already comfortable.
2. **A genuinely useful, portfolio-worthy product.** A working, deployed, well-documented AI coach for a niche but passionate community (competitive Pokémon/VGC) is a much stronger portfolio piece than a generic "chat with your PDF" demo, because it forces real product decisions: multi-step reasoning, tool use, freshness of data (meta shifts constantly), and correctness (bad damage-calc advice is an obviously wrong answer, unlike a fuzzy chatbot response).

## Reference points used to shape this plan

- Author's background/portfolio: [eduardolemos.com](https://eduardolemos.com/) — 10 years full-stack (JS/React/Node/PHP), comfortable picking up new stacks as needed, currently light on Python/AI-specific tooling. This project is deliberately shifting the primary backend language to Python.
- A Google-posted [Staff Applied AI Agent Developer](https://www.google.com/about/careers/applications/jobs/results/114910825608553158-staff-applied-ai-agent-developer) role was the concrete example used to kick off research into what "AI Agent Developer" roles look like — useful for understanding the *shape* of the role (GenAI agents, structured tool-building, production readiness), but it's one company's posting, not the market. It does **not** drive the cloud or model-provider choices below — those are set from aggregated, multi-source, multi-cloud/multi-vendor 2026 hiring and enterprise-adoption data instead (see [`tech-stack.md`](./tech-stack.md#cloud-and-model-provider-decision-revisited) for the correction and the numbers behind it).
- Broad 2026 hiring-data research (frameworks, clouds, vector DBs, eval tooling, MCP, enterprise LLM adoption surveys) — cited inline throughout [`tech-stack.md`](./tech-stack.md).

## Doc index

**Planning & decisions** — what we chose and why, written before/independent of the code:

| Doc | What's in it |
|---|---|
| [`product-research.md`](./product-research.md) | What competitive Pokémon players actually struggle with (Reddit/forums/official Pokémon forums research), the existing competitive-tool landscape, and why DexTrAIner's v1 focus is what it is |
| [`tech-stack.md`](./tech-stack.md) | The full stack, what changed from the initial draft and why, with sources |
| [`architecture.md`](./architecture.md) | System design: components, data flow, agent graph, RAG pipeline |
| [`ai-agents-and-rag.md`](./ai-agents-and-rag.md) | Deep dive on the AI layer: tools, MCP servers, retrieval pipeline, eval/observability strategy |
| [`roadmap.md`](./roadmap.md) | Phased build plan, each phase mapped to the skills it's meant to demonstrate |

**Operational & structural** — how to run the project and how the code that actually exists is organized, kept up to date alongside the code itself (see "Keeping docs current" below):

| Doc | What's in it |
|---|---|
| [`setup.md`](./setup.md) | How to run the whole stack locally (Docker Compose), environment variables, common commands, troubleshooting |
| [`backend/README.md`](./backend/README.md) | `Backend/`'s folder structure, conventions (Settings, DB session, migrations), and Docker image notes |
| [`frontend/README.md`](./frontend/README.md) | `Frontend/`'s folder structure, conventions (branding, state management, shadcn/ui), and Docker image notes |

## Keeping docs current

`Docs/` grows alongside the code, not just up front: whenever a phase adds a new part of the codebase, the relevant doc above gets created or updated in the same pass, and this index gets updated too — nothing should exist in this folder that isn't linked from here.

## Naming & branding

The name isn't locked in yet. To keep a future rename cheap, we're drawing a hard line between the **internal slug** (used in places that are annoying to change) and the **display name** (used everywhere a human actually reads it):

| Layer | Convention | Example now |
|---|---|---|
| Internal slug — repo, Python package, npm package, Docker image/Compose project, database name, env var prefix | Lowercase, hyphen/underscore-safe, chosen once and left alone even if the display name changes; only rename this if it becomes actively confusing | `dextrainer` |
| Display name — UI headers, page titles, README titles, email templates, MCP server's advertised name | **Never hardcoded inline.** Lives in exactly one place per app and is referenced everywhere else | `APP_NAME` constant/env var |

Concretely, once code exists:
- **Frontend:** a single `APP_NAME` (or `VITE_APP_NAME`) value, exported from one config module (e.g. `src/config/branding.ts`), used in the `<title>`, nav header, etc. No component hardcodes the literal string.
- **Backend:** a single `app_name` field on the Pydantic `Settings` object, sourced from an `APP_NAME` env var, used anywhere the name shows up (API docs title, email templates, MCP server's advertised name/description).
- **Docs/marketing prose** (this folder): free to say "DexTrAIner" in running text — renaming these later is a trivial find-and-replace across a handful of Markdown files, so there's no need to over-engineer the docs with placeholder tokens.

**If/when the name changes:** update the two config values above, find-and-replace this docs folder, and decide separately (and only then) whether the internal slug is worth changing too — it usually isn't, since nobody but you ever sees it.

## Core product pillars

Grounded in [`product-research.md`](./product-research.md) — each of these maps to a specific, multi-source-validated pain point or validated-demand category, not a guess. All of them, including the ones with existing competitors, are held to a "best in class" bar — see the Performance principle below.

### Core pillars (v1)

**The "Dex" — the comprehensive competitive reference and tools, excellent on their own merits:**
1. **Pokédex** — a genuine standalone reference, not a side effect of team-building: base stats, full movepool, abilities, type matchups/weaknesses, a natures reference, and tournament usage %, browsable on its own the way Bulbapedia or Smogon's dex pages are (confirmed gap — even ChampTeams, the closest competitor, only surfaces this data inside its team-builder flow, never as a standalone page; see [`product-research.md`](./product-research.md)). **Mega Evolution stat/ability awareness is the sharpest capability inside it** — a specific, official, dev-acknowledged complaint (Pokémon Champions doesn't show Mega stat/ability changes anywhere before you actually mega evolve in a real match) — but it's one capability of a full Pokédex, not the whole feature.
2. **Team Builder & Damage Calculator** — a real deterministic calc engine (never an LLM guessing numbers) and a full team-building experience, competing directly with established tools (ChampTeams, ChampionsMeta, native Play Store calc apps) on accuracy, speed, and polish, not just feature-parity. This category has proven demand (ChampTeams: 1,500+ organic users) — the goal is to do it better, not avoid it because someone else got there first.
3. **Team Analyzer** — type-coverage/speed-tier/role-compression analysis, built on the same Pokédex data, used both directly and as a tool the Conversational Team Doctor calls.
4. **Meta/usage lookup** — leans on existing public tournament/usage data where possible rather than re-deriving everything from scratch; cached and refreshed on a schedule, not fetched live on every request, so it's fast for the user and sustainable to run (see [`tech-stack.md`](./tech-stack.md) for the performance/cost discipline this implies).

**The "TrAIner" — the AI layer that amplifies the Dex, not a separate product bolted alongside it:**
5. **Conversational Team Doctor** — natural-language Q&A that *reasons* about a team/matchup ("lead with X because it outspeeds their likely Trick Room setter and resists their revealed Mega's STAB"), grounded and cited, layered on top of the Dex pillars above. Differentiator: existing tools are calculators with at most a bolted-on AI suggestion button; nothing does real conversational reasoning over Pokédex-grade data.
6. **Mental-Game Coach** — session tracking with a proactive "you've lost 2 in a row, want a break instead of queuing again?" push notification (implementing the community's own "two-loss rule"), and a post-loss breakdown that explains specifically *why* a game was lost — replacing the "that felt random and unfair" feeling that the community itself identifies as tilt's root cause. Zero existing competitors touch this angle at all.

### Deferred to Premium / later (not in the v1 roadmap)
7. **AI Battle Postmortem (video-based)** — user uploads a recording they already made of a Pokémon Champions match (there's no official replay export to build against); AI reconstructs the turn-by-turn battle and coaches the postmortem. This is the single most differentiated, most-requested gap in the whole research pass, but also the most expensive to build well and the most dependent on the user doing extra work up front — explicitly scoped as a later premium feature, not v1.

### Performance
Not a phase, a standing principle: the Team Builder/Calculator only earns the right to compete in an already-well-served category if it's genuinely fast and correct — sub-100ms deterministic calc results, indexed hot-path queries, cache-before-compute, and a frontend performance budget that holds on mobile browsers/low-end devices, not just desktop. See [`tech-stack.md`](./tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have) for the specifics; this applies across every pillar above, not just the calculator.

### Audience
Both **Pokémon Champions/VGC** players and **Pokémon Showdown OU/singles** players, served by the same core agent and tool engine. The two communities need mostly the same underlying reasoning — they differ mainly in data source (Showdown exposes replay logs directly; official Champions currently does not).

### Platform
A single React/TypeScript website, shipped as an installable PWA — that's the only committed platform. A native Google Play app (via Capacitor) is deliberately kept as an optional, unscheduled stretch goal rather than a planned deliverable: it doesn't teach or demonstrate an AI skill, it adds real recurring app-store maintenance overhead, and neither the AI-hiring angle nor the "AI on phones" angle turned out to require it (on-device/edge AI, the one genuinely hot 2026 mobile-AI trend, is reachable straight from the browser via WebGPU — see [`tech-stack.md`](./tech-stack.md#mobile--distribution) for the full reasoning, including two research passes that reversed the original call).
