# Master Ball — Docs

Master Ball is a competitive Pokémon companion held to a "best in class" bar: a genuine toolkit — Pokédex, Team Builder, and Damage Calculator (a proven, in-demand category — see [`product-research.md`](./product-research.md)) — plus an AI Professor that reasons in plain English about a team/matchup instead of just showing numbers, and helps with the mental-game side of laddering that every existing tool ignores. Neither half is the "real" product with the other bolted on: the competitive tools have to be excellent on their own merits, and the AI has to be a genuine value-add on top of them, not a thin wrapper around a calculator. Being successful here was never about being the only tool in the category — it's about doing the job better than what exists, on every axis, including raw performance.

See [Naming & branding](#naming--branding) for how display name vs internal slug are kept separate.

> **Product scope note:** the original one-liner above (and the six "pillars" this doc used to list) came from an early concept draft. It's since been replaced by [`product-research.md`](./product-research.md) — research into what competitive Pokémon players are actually frustrated by (Reddit, Smogon forums, official Pokémon forums, existing app reviews), what's already been built by others, and where the real gap is. Read that doc for the reasoning behind the "Core product pillars" section below.

## Why this project exists

Master Ball exists to be a first-class competitive Pokémon toolkit **and** a production-grade AI coach on top of that toolkit:

1. **Competitive tools that stand alone** — Pokédex, Team Builder, and Damage Calculator held to a best-in-class bar against existing apps in the category.
2. **An AI Professor that earns its place** — agent orchestration (LangGraph/LangChain), RAG, MCP, structured tool-calling, evaluation/observability, and cloud-native deployment wired into real product surfaces, not a thin chat wrapper around a calculator.

## Reference points used to shape this plan

- Player research into competitive Pokémon frustrations and the existing tool landscape — see [`product-research.md`](./product-research.md).
- Industry-adoption research on AI-agent stacks (frameworks, clouds, vector DBs, eval tooling, MCP, enterprise LLM surveys) — cited inline throughout [`tech-stack.md`](./tech-stack.md).
- Python as the primary backend language because nearly every AI/agent framework, eval tool, and ML library targets it first.

## Doc index

**Planning & decisions** — what we chose and why, written before/independent of the code:

| Doc | What's in it |
|---|---|
| [`product-research.md`](./product-research.md) | What competitive Pokémon players actually struggle with (Reddit/forums/official Pokémon forums research), the existing competitive-tool landscape, and why Master Ball's v1 focus is what it is |
| [`tech-stack.md`](./tech-stack.md) | The full stack, what changed from the initial draft and why, with sources |
| [`architecture.md`](./architecture.md) | System design: components, data flow, agent graph, RAG pipeline |
| [`ai-agents-and-rag.md`](./ai-agents-and-rag.md) | Deep dive on the AI layer: tools, MCP servers, retrieval pipeline, eval/observability strategy |
| [`roadmap.md`](./roadmap.md) | Phased build plan, each phase mapped to what it ships and why |

**Operational & structural** — how to run the project and how the code that actually exists is organized, kept up to date alongside the code itself (see "Keeping docs current" below):

| Doc | What's in it |
|---|---|
| [`setup.md`](./setup.md) | How to run the whole stack locally (Docker Compose), environment variables, common commands, troubleshooting |
| [`cursor/local.md`](./cursor/local.md) / [`cursor/remote.md`](./cursor/remote.md) | Production AWS ops: laptop ↔ EC2 cutover, CodePipeline, server `.env`, bootstrap |
| [`backend/README.md`](./backend/README.md) | `Backend/`'s folder structure, conventions (Settings, DB session, migrations, tools/schemas/routers pattern), data seeding, and Docker image notes |
| [`backend/damage-calc.md`](./backend/damage-calc.md) | The damage calculator's exact formula scope — what's implemented, what's deliberately deferred, and how it's verified |
| [`frontend/README.md`](./frontend/README.md) | `Frontend/`'s folder structure, conventions (routing, branding, state management, shadcn/ui), and Docker image notes |

## Keeping docs current

`Docs/` grows alongside the code, not just up front: whenever a phase adds a new part of the codebase, the relevant doc above gets created or updated in the same pass, and this index gets updated too — nothing should exist in this folder that isn't linked from here.

## Naming & branding

Display name vs internal slug stay separate so a future rename stays cheap:

| Layer | Convention | Example now |
|---|---|---|
| Internal slug — repo folder, Python package, npm package, Docker Compose project, database name | Lowercase, hyphen/underscore-safe | `master-ball` / `masterball` |
| Display name — UI headers, page titles, README titles, MCP advertised name | **Never hardcoded inline.** Lives in exactly one place per app | `Master Ball` via `APP_NAME` |

Concretely, once code exists:
- **Frontend:** a single `APP_NAME` (or `VITE_APP_NAME`) value, exported from one config module (e.g. `src/config/branding.ts`), used in the `<title>`, nav header, etc. No component hardcodes the literal string.
- **Backend:** a single `app_name` field on the Pydantic `Settings` object, sourced from an `APP_NAME` env var, used anywhere the name shows up (API docs title, email templates, MCP server's advertised name/description).
- **Docs/marketing prose** (this folder): free to say "Master Ball" in running text — renaming these later is a trivial find-and-replace across a handful of Markdown files, so there's no need to over-engineer the docs with placeholder tokens.

**If/when the name changes:** update the two config values above, find-and-replace this docs folder, and decide separately (and only then) whether the internal slug is worth changing too — it usually isn't, since nobody but you ever sees it.

## Core product pillars

Grounded in [`product-research.md`](./product-research.md) — each of these maps to a specific, multi-source-validated pain point or validated-demand category, not a guess. All of them, including the ones with existing competitors, are held to a "best in class" bar — see the Performance principle below.

### Core pillars (v1)

**Competitive tools — excellent on their own merits:**
1. **Pokédex** — a genuine standalone reference, not a side effect of team-building: base stats, full movepool, abilities, type matchups/weaknesses, a natures reference, and tournament usage %, browsable on its own the way Bulbapedia or Smogon's dex pages are (confirmed gap — even ChampTeams, the closest competitor, only surfaces this data inside its team-builder flow, never as a standalone page; see [`product-research.md`](./product-research.md)). **Mega Evolution stat/ability awareness is the sharpest capability inside it** — a specific, official, dev-acknowledged complaint (Pokémon Champions doesn't show Mega stat/ability changes anywhere before you actually mega evolve in a real match) — but it's one capability of a full Pokédex, not the whole feature.
2. **Team Builder & Damage Calculator** — a real deterministic calc engine (never an LLM guessing numbers) and a full team-building experience, competing directly with established tools (ChampTeams, ChampionsMeta, native Play Store calc apps) on accuracy, speed, and polish, not just feature-parity. This category has proven demand (ChampTeams: 1,500+ organic users) — the goal is to do it better, not avoid it because someone else got there first.
3. **Team Analyzer** — type-coverage/speed-tier/role-compression analysis, built on the same Pokédex data, used both directly and as a tool the Conversational Team Doctor calls.
4. **Meta/usage lookup** — leans on existing public tournament/usage data where possible rather than re-deriving everything from scratch; cached and refreshed on a schedule, not fetched live on every request, so it's fast for the user and sustainable to run (see [`tech-stack.md`](./tech-stack.md) for the performance/cost discipline this implies).

**AI coaching — amplifies the tools above, not a separate product bolted alongside them:**
5. **Conversational Team Doctor** — natural-language Q&A that *reasons* about a team/matchup ("lead with X because it outspeeds their likely Trick Room setter and resists their revealed Mega's STAB"), grounded and cited, layered on top of the competitive-tool pillars above. Differentiator: existing tools are calculators with at most a bolted-on AI suggestion button; nothing does real conversational reasoning over Pokédex-grade data.
6. **Mental-Game Coach** — session tracking with a proactive "you've lost 2 in a row, want a break instead of queuing again?" push notification (implementing the community's own "two-loss rule"), and a post-loss breakdown that explains specifically *why* a game was lost — replacing the "that felt random and unfair" feeling that the community itself identifies as tilt's root cause. Zero existing competitors touch this angle at all.

### Deferred to Premium / later (not in the v1 roadmap)
7. **AI Battle Postmortem (video-based)** — user uploads a recording they already made of a Pokémon Champions match (there's no official replay export to build against); AI reconstructs the turn-by-turn battle and coaches the postmortem. This is the single most differentiated, most-requested gap in the whole research pass, but also the most expensive to build well and the most dependent on the user doing extra work up front — explicitly scoped as a later premium feature, not v1.

### Performance
Not a phase, a standing principle: the Team Builder/Calculator only earns the right to compete in an already-well-served category if it's genuinely fast and correct — sub-100ms deterministic calc results, indexed hot-path queries, cache-before-compute, and a frontend performance budget that holds on mobile browsers/low-end devices, not just desktop. See [`tech-stack.md`](./tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have) for the specifics; this applies across every pillar above, not just the calculator.

### Data integrity — no hardcoded/placeholder data, ever
Also a standing principle, not a phase: this is a production-ready platform, so reference data (ability/move descriptions, usage stats, meta data, anything else a real Pokédex/tool would show) must come from a real, authoritative source and actually live in the database — never a hand-typed, partial-coverage stopgap "for now." A concrete example of getting this wrong and fixing it: the Pokédex's ability descriptions were initially a hardcoded Python `dict` covering ~30 common abilities, leaving most of the Pokédex showing "Description not yet catalogued." That was reverted in favor of fetching real, complete descriptions for (near-)every ability and move from [PokeAPI](https://pokeapi.co) at seed time and storing them in Postgres — see [`backend/README.md`](./backend/README.md#ability-move-descriptions-real-data-only-never-a-hardcoded-stopgap) for the details. If a genuine data gap exists (a source truly doesn't have something yet), that's fine and should be left `null`/documented — the rule is against *fabricating or hand-typing a subset* to paper over missing integration work, not against having honest gaps.

### SEO — every page is a real, indexable, shareable page
Also a standing principle: this is a public content site (thousands of Pokémon/move/ability/item/type pages, each genuinely worth ranking for its own name), not just an interactive tool — so every new routed page ships with a page-specific title/description, a canonical URL, Open Graph/Twitter tags, and (for detail pages) breadcrumb navigation + matching structured data, in the same PR that adds the page. See [`frontend/README.md`](./frontend/README.md#seo) for the concrete mechanism (the `Seo`/`Breadcrumbs` components) and the gotchas already hit building it.

### Audience
Both **Pokémon Champions/VGC** players and **Pokémon Showdown OU/singles** players, served by the same core agent and tool engine. The two communities need mostly the same underlying reasoning — they differ mainly in data source (Showdown exposes replay logs directly; official Champions currently does not).

### Platform
A single React/TypeScript website, shipped as an installable PWA — that's the only committed platform. A native Google Play app (via Capacitor) is deliberately kept as an optional, unscheduled stretch goal rather than a planned deliverable: it adds real, recurring app-store maintenance overhead unrelated to the AI work, and the "AI on phones" angle turned out not to require it (on-device/edge AI, the one genuinely hot 2026 mobile-AI trend, is reachable straight from the browser via WebGPU — see [`tech-stack.md`](./tech-stack.md#mobile--distribution) for the full reasoning, including two research passes that reversed the original call).
