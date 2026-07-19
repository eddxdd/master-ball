# Tech Stack

This document is the single source of truth for stack decisions. Each section states the choice, why, and — where it deviates from the original ChatGPT-drafted stack — what changed and the source backing that change.

> **How to read this doc:** everything here is optimized for two things simultaneously — (1) it should actually be the right tool for a Pokémon AI coach, and (2) it should reflect what's genuinely seeing production adoption in the AI-agent industry right now, not what was popular two years ago. Where those two things conflicted, we picked the one that's still defensible technically and explained the trade-off rather than picking blind. All specific stats below are as of live 2026 industry-adoption research; treat exact percentages as directional, not gospel.

> **Revision note (cloud/model):** the first pass of this doc leaned on Google Cloud and Gemini more than the aggregate market data actually supports — largely because an early single-vendor example skewed the framing. A second, deliberately vendor-agnostic research pass (aggregating multiple independent 2026 industry analyses of AI-agent / LLM production stacks, plus enterprise LLM-adoption surveys) corrected two decisions: **cloud primary moved from GCP to AWS**, and **LLM provider primary moved from Gemini to a Claude/OpenAI pairing with Gemini as a third, specialist provider**. Both corrections are laid out with numbers below.

> **Revision note (product/platform):** after the stack above was set, the actual product scope got narrowed based on real research into player pain points (see [`product-research.md`](./product-research.md)), which raised the mobile-distribution question and added an explicit **performance & cost discipline** principle (its own section below) — the Team Builder/Calculator are core pillars competing against established, well-built tools, so speed and correctness are first-class requirements everywhere.

> **Revision note (platform, corrected again):** the mobile-distribution call below went through two passes. First pass: Google Play became an explicit goal and **Capacitor** was chosen as the wrapper. Second pass, after weighing this against the project's actual scope (a focused web product, not a multi-platform business) and researching the "impact of AI on phones" question directly: **the website (built as a PWA) is now the only committed platform**, with Capacitor/native-app packaging demoted to an explicit, optional, do-later-if-there's-time stretch goal. See "Mobile & distribution" below for the full reasoning, including two 2026 data points that reinforced this — Google Play's 2026 policy tightening specifically for "AI companion apps," and PWAs now out-converting Play Store listings on install rate.

> **Revision note (full re-verification pass):** every section below was re-checked against fresh mid-2026 research rather than assumed still-correct, since this space moves fast and stale claims from an earlier point in 2026 aren't good enough to rely on. **One real change came out of it: Redis → Valkey.** Everything else held up — LangGraph/LangChain/LlamaIndex, the Claude/OpenAI/Gemini provider mix, AWS-primary, and pgvector-first were all independently re-confirmed by newer sources, in some cases with even stronger numbers than the original pass found. Two new additions worth knowing about, not adopting: **Google's Agent2Agent (A2A) protocol** as MCP's now-official complement for agent-to-agent (not agent-to-tool) coordination, and a note on **LangChain's growing "saturation" as a widely-adopted baseline**, which sharpens (doesn't change) the existing "know when to skip the framework" principle. Details inline below, each tagged *(re-verified 2026)*.

## Summary of changes from the initial draft

| Area | Original (ChatGPT) | Updated | Why |
|---|---|---|---|
| AI/Agents | LangGraph, LangChain, Gemini, OpenAI fallback | + **Model Context Protocol (MCP) servers**, + **LlamaIndex** for ingestion, explicit **direct-API escape hatch** for hot paths, **provider mix corrected** (see below) | MCP is the fastest-rising named skill in senior agent postings in 2026; LlamaIndex is the named complement to LangChain/LangGraph specifically for retrieval-heavy products; "know when to drop the framework" is a senior-level signal |
| **LLM provider** | Gemini primary, OpenAI fallback | **Claude (Anthropic) primary for agent reasoning/tool-use, OpenAI as the co-primary for broad-ecosystem/high-volume tasks, Gemini as the third provider for multimodal + cheap-at-scale work** | See "Cloud and model-provider decision, revisited" below — this was the most bias-corrected call in the whole doc |
| Observability | LangSmith, PostHog, Sentry, GCP Logging | + **Langfuse** (learn both), + **RAGAS + promptfoo** as a CI eval gate | LangSmith + Langfuse are 56% of all eval-tool job mentions combined; nothing in the original stack gates a PR on a prompt regression |
| Backend | (no task queue) | + **Arq (or Celery) + Valkey** for background jobs (was "Redis" in the first draft — see below) | Replay parsing / meta scraping are async workloads; "shipping to production" is the most repeated theme in 2026 AI-industry adoption research |
| **Cache/queue engine** *(re-verified 2026)* | Redis | **Valkey** — a wire-compatible, drop-in Redis fork | Redis Inc. relicensed Redis (SSPL/RSALv2) in 2024; AWS, Google, and others responded by forking the last BSD-licensed version as Valkey under the Linux Foundation. AWS ElastiCache now defaults new clusters to Valkey and is deprecating active development on Redis OSS — since AWS is the primary cloud here, this isn't a style preference, it's following where the primary vendor is actually pointing new workloads |
| Advanced layer | Neo4j "later" | **Neo4j promoted to a real Phase 2 item** | Pokémon type/move/ability data is natively graph-shaped; GraphRAG is a genuinely hot, differentiated 2026 technique — rare case where the trendy thing and the domain fit are the same thing |
| **Cloud** | GCP-only | **AWS as primary**, GCP/Vertex AI kept as a documented stretch goal | Corrected after a vendor-agnostic pass — see below. AWS is the clear #1 cloud named specifically for AI-agent / LLM production stacks across every independent study checked |
| Testing | (not specified) | + **pytest, Vitest, Playwright** named explicitly | Testing wasn't a gap in judgment so much as an omission — it needs to be a first-class, named part of the stack, not implied |
| Mobile/distribution | (not specified) | **Website, built as a PWA** — installable, offline-capable, Web Push-capable. **Capacitor** (native Google Play packaging) kept only as an optional, unscheduled stretch goal | Went through two passes — see the revision note above. Net call: a native app wasn't required by the "AI on phones" angle either, so both are better served by staying web-first (see "Mobile & distribution" below) |
| Performance | (implicit) | **Named explicitly as a first-class requirement** — sub-100ms deterministic calc tools, DB indexing on hot paths, frontend code-splitting, cache-before-compute | The Team Builder/Calculator compete directly against established, well-built tools (ChampTeams, native Play Store calc apps) — see [`product-research.md`](./product-research.md); "fast and correct" is table stakes for that category, not a nice-to-have |
| On-device/edge AI | (not specified) | + **WebGPU + Transformers.js/WebLLM** as an explicit optional stretch item | Useful for low-latency, private client-side signals (quantization, local inference runtimes) and reachable entirely from the browser — no native app required; see "On-device/edge AI" below |

Everything else in the original draft (React/TS/Vite/Tailwind/TanStack Query/Zustand, FastAPI, PostgreSQL, SQLAlchemy/SQLModel, pgvector-first, WebSockets, Docker, GitHub Actions, scikit-learn → XGBoost → PyTorch progression) was already well-aligned with current industry-adoption data and is kept as-is. The one exception found on re-verification is the caching layer (Redis → Valkey, same role, different underlying engine — see the Cache/queue engine row above and the Backend section below). See inline notes below for the reasoning on each.

## Cloud and model-provider decision, revisited

This section exists specifically to show the work, since these two calls were wrong in the first pass.

**Cloud — aggregated across four independent 2026 studies of AI-agent / LLM production stacks specifically (not general cloud/DevOps surveys, which skew even more toward AWS):**

| Study (sample size) | AWS | Azure | GCP |
|---|---|---|---|
| Industry analysis of 3,449 AI-agent stack mentions | 37% | 33% | 25% |
| DevJobs.pro | 44% | 27% | 29% |
| AI Shipping Labs (1,000+ postings) | 40% | 24% | 23% |
| alexeygrigorev/ai-engineering-field-guide (895 postings, builtin.com) | 40% | — | — |

AWS is #1 in every single one of these, by a real margin, not a rounding error. GCP is consistently third. The one place GCP has genuine, defensible strength is ML/data-specialist niches specifically (Vertex AI, BigQuery) — but "most-adopted, most well-rounded" is unambiguously AWS. **Cloud primary is now AWS** (ECS/Fargate or App Runner for hosting, RDS for PostgreSQL+pgvector, S3 for blobs, Bedrock for unified multi-model access — Bedrock natively hosts Claude, several open-weight models, and increasingly others). GCP/Vertex AI moves to the roadmap as a documented stretch goal (see [`roadmap.md`](./roadmap.md)) — kept as an optional multi-cloud exercise, not as the foundation everything else is built on.

*(Re-verified 2026, one nuance worth naming honestly, not hiding:* general cloud infrastructure market share (not AI-agent-stack share specifically) shows AWS still #1 at ~30% but the *slowest-growing* of the big three (+19% YoY), while Azure (~25%, +40% YoY) and GCP (~13%, +63% YoY) are gaining ground fast, with AI workloads cited as the main driver of that growth-rate gap. This doesn't change the recommendation — the decision here was deliberately anchored on *AI-agent / LLM stack* mentions, not overall infrastructure spend, and AWS still leads that specific metric clearly — but the broader trend line is worth tracking.)*

**LLM provider — original pass used a16z/CIO, Menlo Ventures mid-2025, and Empire325 2026 surveys; *(re-verified 2026)* against newer a16z, Menlo, Enterprise Technology Research/WSJ, and Ramp spend-index data, which — if anything — made the original call look more correct, not less:**

| Provider | Enterprise production usage | Enterprise API spend share | Where it actually wins |
|---|---|---|---|
| OpenAI | Still #1 on raw production usage (56–78% depending on survey), but share compressing — down from a 41-point lead over Anthropic a year ago to ~8 points by March 2026 (ETR/WSJ) | Slipped to ~27% (Menlo), down from ~50% two years prior | Horizontal use cases — chatbots, knowledge search, customer support; broadest tooling/framework support; consumer dominant (~900M–1B weekly ChatGPT users) |
| **Anthropic (Claude)** | 44–48% and the fastest-growing provider in every survey checked (one reports 21%→48% in twelve months) | **Now #1 on enterprise API spend at ~40% (Menlo), overtaking OpenAI for the first time**, up from ~12% in 2023 | **Coding and agentic tool-use specifically** — ~54% of the enterprise coding market vs. OpenAI's ~21% (Menlo); Claude Code alone reached $1B annualized revenue within 6 months of launch. Coding is enterprises' single largest GenAI spend category, which is most of why the spend-share lead flipped |
| Gemini | Fastest-*growing total penetration* of the three (one survey: 27%→40% in a year) | ~17–24%, growing | Native multimodal (video/audio), longest-context economics at the lowest price point — growth is real but explicitly driven by *distribution* (bundled into Workspace/Vertex AI accounts a company already has), not by being chosen head-to-head; still the weakest of the three specifically for coding/agentic work |

The most telling data point, re-confirmed and now sharper: when enterprises run more than one model, the dominant routing pattern is still **"Claude for coding/complex reasoning, GPT for general assistant tasks,"** and Claude now *wins the majority of head-to-head deals* when businesses choose between it and OpenAI for new enterprise adoption (~70% win rate per Ramp's index). Given Master Ball's actual workload — multi-step reasoning, tool calling, replay postmortems, team analysis — this isn't just still a defensible call, the market moved further in the direction the project already bet on.

**Provider mix is now:**
- **Claude (Anthropic), via Amazon Bedrock** — primary for the agent's actual reasoning/synthesis work (team analysis explanations, replay postmortems, tool-orchestration decisions). Matches both the technical workload and the fastest-growing/most agent-relevant provider.
- **OpenAI** — co-primary, used for the router/classification step and any high-volume simple task, and kept as a first-class provider (not an afterthought) specifically because it's still the single most-adopted API, the one most frameworks and examples assume by default.
- **Gemini** — third provider, used deliberately where its actual strengths apply: multimodal input (a screenshotted team sheet or board state) and bulk/cheap processing of large tournament-report corpora. Kept, not dropped — but as a specialist, not the default.

This is a genuine multi-vendor architecture with a real provider-abstraction layer (LangChain's chat-model interface makes this closer to a config change than a rewrite) — it's exactly the pattern the enterprise data says real companies converged on.

---

## Frontend

| Tool | Role |
|---|---|
| **React** | UI library. Still the dominant default choice; no reason to deviate. |
| **TypeScript** | Type safety across the whole frontend; pairs with typed API contracts from FastAPI/Pydantic. |
| **Vite** | Build tool/dev server. Faster and simpler than the CRA/webpack alternatives it replaced. |
| **Tailwind CSS** | Utility-first styling. |
| **shadcn/ui** *(added)* | Accessible, unstyled-then-Tailwind-styled component primitives (Radix under the hood). Common in modern AI-product UIs alongside Tailwind because it's the fastest path to a clean, non-generic-looking UI without a heavy design-system dependency. |
| **TanStack Query** | Server-state caching/sync — critical once the app has streaming AI responses, polling replay-parse jobs, etc. |
| **Zustand** | Lightweight client state (active team being edited, UI state) without Redux ceremony. |
| **PWA (Vite plugin: `vite-plugin-pwa`)** *(added)* | Web app manifest + service worker on top of this exact app — installable to a home screen, works offline for cached routes/assets, and supports Web Push. This is now the **only committed mobile-distribution mechanism** — see "Mobile & distribution" below. |
| **Biome** *(added — pinned during Phase 0 implementation)* | Lint + format, replacing an ESLint + Prettier combination. | Also Rust-based, also the 2026 default for new React/TS/Vite projects: one `biome.json` instead of coordinating `.eslintrc` + `.prettierrc` (which routinely fight over formatting rules). Doesn't touch testing — Vitest is unaffected and stays as the test runner. Vite's own scaffolding tool now defaults new projects to a different Rust-based linter (`oxlint`) rather than ESLint, which is itself confirmation the ecosystem has moved off ESLint/Prettier as the default — Biome was chosen over oxlint specifically because it also replaces the formatter (Prettier), not just the linter, keeping one tool/one config file for both jobs. |
| **React Router** *(added — pinned during Phase 1 implementation)* | Client-side routing, once Phase 1 introduces more than one page (Pokédex, Calculator, Team Builder). | Still the dominant, most job-relevant React routing library and the simplest to wire into an existing Vite app — no reason to reach for a framework-level router (e.g. TanStack Router/Next.js) for a client-rendered SPA that doesn't need file-based routing or SSR. |

No other changes from the original draft here — it was already a strong, modern, widely-adopted frontend stack.

### Mobile & distribution

This went through two research passes, and it's worth showing both, because the second one reversed the first.

**Pass 1:** Google Play became an explicit product goal, which raised a real architectural fork — build a separate mobile app, or ship one product with two shells (website + Play Store app)? Researched PWA/TWA vs. React Native vs. Capacitor and landed on **Capacitor**: same codebase as the website, real native-shell Play Store presence, native plugins (camera, push) added only as needed. That reasoning is still sound *if* a Play Store app is actually the goal — see the comparison table kept below for reference.

**Pass 2:** stepping back and weighing this against what the project is actually for — a focused AI-agent product, not a multi-platform app business — changed the conclusion. Two things drove the reversal:
1. **None of it advances the AI work.** Capacitor setup, Android signing, Play Console policy compliance, and ongoing release/review cycles are real, recurring, non-AI engineering overhead that doesn't move the agent/RAG/eval/MCP work forward.
2. **The AI angle doesn't require native either.** App-store discovery features are irrelevant to the build decision. On-device/edge inference is reachable from a browser via WebGPU (see "On-device/edge AI" below). The one genuinely native-locked capability, Android's Gemini Nano via AICore, [Source](https://developer.android.com/ai/gemini-nano) is real but narrow (Android-only, one vendor) — kept as an optional future plugin idea, not a reason to commit to the app-store path now.

Two additional 2026 data points found during that second pass reinforced staying web-first specifically for *this* app, on top of the reasoning above:
- **Google Play tightened policy in 2026 specifically for "AI companion apps"** as a category — longer review cycles, higher account-suspension risk — which is uncomfortably close to what a coaching app is. [Source](https://androidpwa.com/2026/04/12/android-pwa-vs-google-play-complete-guide-v2/)
- **PWAs are now measurably outperforming Play Store listings on install conversion** (~1.2x higher) and have grown to ~19% of mobile web sessions (up from ~12% two years prior), specifically because they skip the review queue and the store commission. [Source](https://androidpwa.com/2026/06/17/android-pwa-vs-google-play-complete-guide-v2-4/)

**Net decision: the website, built as a PWA, is the only committed platform.** No native wrapper, no Play Store submission planned. Capacitor stays fully documented below as the correct *if we ever do it* answer, kept as an explicit, optional, unscheduled stretch item (see [`roadmap.md`](./roadmap.md)) — not because the earlier research was wrong, but because "is this the right way to package a mobile app" and "should we package a mobile app for this project at all" turned out to be two different questions, and only the first one got asked in pass 1.

<details>
<summary>Reference: Capacitor vs. React Native vs. PWA/TWA, if a native app is ever pursued</summary>

| Option | What it gives you | Trade-off |
|---|---|---|
| Bare PWA wrapped in a Trusted Web Activity (TWA) | Near-zero extra work to get onto Google Play; smallest possible app size | Limited to what a browser exposes — no camera/file picker, weaker/less reliable push notifications |
| React Native | The most "native" feel/performance, native UI components | A genuinely separate codebase from the web app — only worth it if native performance/animation *is* the product, which this isn't |
| Capacitor | Wraps the *existing* React/TS/Vite/Tailwind/shadcn app as-is; ships to Google Play as a real, policy-compliant native shell; adds native plugins (camera/file picker, push, Gemini Nano/AICore) only where actually needed | Real, recurring app-store maintenance overhead (signing, review cycles, policy compliance) for a project that doesn't need store distribution to succeed |

[Source](https://ourcodeworld.com/articles/read/3646/pwa-vs-capacitor-vs-native-2026) [Source](https://www.bretcameron.com/blog/react-native-vs-capacitor-why-i-use-both)

</details>

### On-device/edge AI (optional stretch — see [`roadmap.md`](./roadmap.md))

Researched specifically in response to "should the AI-on-phones trend change the platform call" — it doesn't change the platform call, but it is a legitimate, separate, additive skill worth having on the roadmap regardless of website-vs-app:

| Tool | Role |
|---|---|
| **WebGPU** | Browser-native GPU compute API — as of 2026, on by default in Chrome/Edge/Safari, and the thing that makes real local LLM/embedding inference in a browser tab fast enough to be practical (10–15x WASM for larger models). [Source](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/) |
| **Transformers.js (`@huggingface/transformers`) / WebLLM** | Run a small local model (embeddings, classification, or a small generative model) entirely client-side, with automatic WASM fallback where WebGPU isn't available. [Source](https://vadimall.com/posts/transformers-js-v4-webgpu-browser-ai-typescript) |

**Why this earns a place on the roadmap even though it's not core:** on-device/edge inference (quantization, local inference runtimes) is a different technique from the cloud-agent-orchestration work that's the rest of this stack, and it's usable straight from the browser with no native app required. A concrete product use: running a small local model against a post-loss note for an instant mood/tilt signal, without a network round-trip, as part of the Mental-Game Coach — a real "why on-device here and not elsewhere" design decision, not a tacked-on demo.

### Performance & cost discipline (explicit architecture principle, not just a nice-to-have)

The Team Builder and Damage Calculator are core product pillars competing against established tools (ChampTeams, ChampionsMeta, native Play Store calc apps) — see [`product-research.md`](./product-research.md). Being credible there means being genuinely fast and correct, not just feature-complete. Performance is treated as a first-class, always-on requirement across the stack, not a Phase-N-later optimization pass:

- **Calc/analysis tools are instant.** `calculate_damage`, `analyze_team`, and `get_pokemon_profile` (the Pokédex/Mega-aware lookup) are pure, deterministic, in-process computation with no network or LLM round trip on the hot path — target sub-100ms server response, and cheap enough to eventually run client-side (a shared TypeScript port of the same verified formulas, similar to how `@smogon/calc` ships as a standalone JS package) so the UI can render results with zero perceived latency, matching or beating the "instant" feel of the established native calculator apps.
- **Batch/scheduled ingestion over live third-party calls.** Tournament/usage data is fetched and cached on a schedule via the Arq background worker (see Backend), not re-fetched from a third party on every user request — this is both a cost control and a latency win (serving from Postgres/Valkey is faster than round-tripping to an external source on every page load).
- **Cache aggressively in Postgres/Valkey** before reaching for another LLM call or external API call — most "what beats X" or "what's the current meta usage for Y" questions should resolve from cached/pre-computed data, with the LLM reasoning over that cached context rather than regenerating it.
- **The deterministic damage calculator and team analyzer never call an LLM** — see the AI/Agents section below. This is a correctness rule first, but it's also the biggest single latency/cost win available: the fast path never touches the slowest, most expensive part of the stack.
- **Frontend performance budget:** code-split by route, lazy-load the chat/agent UI separately from the Team Builder/Calculator so the "instant tool" experience doesn't pay for the AI bundle weight; this matters doubly on mobile browsers/low-end devices, which is where a meaningful share of this audience will actually be using the PWA.
- **Database performance:** indexes on the lookup paths that back the calculator/builder (species/move/ability lookups, usage-stat queries) are treated as required, not an optimization to revisit later — these are on the hot path for the core product pillars, not a background job.

## Backend

| Tool | Role |
|---|---|
| **Python** | Backend language. This is the deliberate language switch from the JS/Node background — nearly every AI/agent framework, eval tool, and ML library targets Python first. |
| **FastAPI** | Web framework. Native Pydantic integration (validation *and* structured LLM outputs use the same models), async-first (matters for streaming + concurrent tool calls), and it's among the most-cited web frameworks in LangChain-ecosystem production stacks (~17%). |
| **PostgreSQL** | Primary datastore — battles, teams, users, tournament data, *and* vectors (see RAG section). One database instead of Postgres + a separate vector service is a real operational simplicity win, not just a cost shortcut. |
| **SQLAlchemy 2.0 / SQLModel** | ORM. SQLModel (from the FastAPI author) gives one model definition shared between DB schema, request/response validation, and (optionally) LLM structured-output schemas — worth trying first; fall back to plain SQLAlchemy if SQLModel's abstractions get in the way for complex queries. |
| **Valkey** *(was Redis in the first draft — see revision note above)* | Cache + rate limiting + pub/sub for streaming updates, via **Amazon ElastiCache for Valkey**. |
| **Arq (or Celery) + Valkey** *(added)* | Background task queue. Replay parsing, tournament-data ingestion/scraping, and RAG re-indexing are not request/response work — they need a real worker queue. Arq is the lighter-weight, asyncio-native option and pairs naturally with an already-async FastAPI app; Celery is the more battle-tested/heavier option if the job graph gets complex (retries, chaining, scheduling). Start with Arq. |
| **pytest** *(named explicitly)* | Backend test framework — unit tests for the damage-calc engine (this one absolutely needs deterministic tests), integration tests for API routes, and it's also what DeepEval/RAGAS hook into for LLM eval-as-CI-test. Includes **pytest-benchmark** on the calc/analyzer tools specifically, so a performance regression on the core product pillars fails CI the same way a correctness regression would — see "Performance & cost discipline" above. |
| **uv** *(added — pinned during Phase 0 implementation)* | Python package/project/venv manager, replacing pip + venv + pyenv + pip-tools. | Astral's converged 2026 default for Python services: a single Rust binary, 10-100x faster installs than pip, and one lockfile (`uv.lock`) instead of juggling `requirements.txt`/`requirements-dev.txt` by hand. Also now has real enterprise backing — OpenAI acquired Astral in March 2026 — so this isn't just a fast tool, it's the direction the ecosystem is consolidating toward. |
| **Ruff** *(added — pinned during Phase 0 implementation)* | Lint + format, replacing a black + flake8 + isort combination. | Also Astral, also Rust-based, natural pairing with `uv`. One config block in `pyproject.toml` instead of coordinating three separate tools that occasionally disagree with each other. |
| **poke-env** *(added — pinned during Phase 1 implementation, seed-time only)* | Source of the Pokédex/move/nature/type-chart data seeded into Postgres, and the Showdown-export team-import parser (`Teambuilder.parse_showdown_team`). | `product-research.md` already noted ChampTeams is seeded from `@pkmn/dex` (Pokémon Showdown's own JS data layer) — `poke-env` is the Python-ecosystem equivalent: it ships the same Showdown data files (auto-synced monthly from Smogon), including every Mega Evolution forme as its own pokedex entry with its own stats/abilities, which is exactly what the Pokédex's Mega-awareness requirement needs. Using an existing, maintained data source instead of hand-rolling a Node.js export pipeline or scraping is the correct call here — the actual differentiated work is the damage-calc engine and the AI layer on top, not re-deriving Pokémon data that's already solved. One real gap: it doesn't expose ability/move *description* text via its public API (mechanical data only, no flavor text) — documented as a known limitation in `Docs/backend/damage-calc.md` rather than silently worked around. |

**Why Valkey and not Redis *(re-verified 2026)*:** in March 2024, Redis Inc. relicensed all new Redis releases away from the permissive BSD-3-Clause license to the more restrictive SSPL/RSALv2 — specifically aimed at stopping cloud providers from offering Redis as a managed service without paying Redis Inc. AWS, Google, Oracle, and others responded by forking the last BSD-licensed release (7.2.4) as **Valkey**, now governed by the Linux Foundation. Since AWS is this project's primary cloud, this isn't just a licensing footnote: **Amazon ElastiCache now defaults new clusters to Valkey and is no longer actively developing new Redis OSS node generations** — Valkey is where AWS is actually pointing new workloads, it's wire-compatible (same client libraries, same protocol, no code changes), and it's measurably cheaper on ElastiCache besides. It's also a real, recent (2024–2026) open-source licensing story worth knowing, and a good example of why a dependency choice matters beyond "it's the popular one," not just habit from an older tutorial.

## AI / Agents

This is the most consequential section — the AI/agent layer is the actual point of the product.

| Tool | Role | Notes |
|---|---|---|
| **LangGraph** | Agent orchestration — the stateful graph that represents "coach reasoning": gather context → decide which tools to call → call them → synthesize → (optionally) ask a clarifying question → respond. | Kept from original, re-confirmed 2026: still the pick specifically for *durable state, human-in-the-loop, and branching logic* — which is a precise description of what Master Ball needs (multi-step tool composition, the async Mental-Game Coach nudge flow). CrewAI has more raw adoption (44.6k GitHub stars vs. LangGraph's 25k) but is explicitly the "team of pre-built agents, ship fast" tool, at the cost of more non-determinism — the wrong trade for a product where correctness matters. Pydantic AI is a fast-rising, type-safe alternative worth knowing about (and Master Ball already leans on Pydantic elsewhere), but LangGraph's more mature durable-execution/checkpointing story is still the better fit here today. [Source](https://dev.to/linou518/the-2026-ai-agent-framework-decision-guide-langgraph-vs-crewai-vs-pydantic-ai-b2h) [Source](https://dev.to/gabrielanhaia/picking-an-agent-framework-in-2026-an-honest-verdict-on-six-of-them-1a6h) |
| **LangChain** | Model-agnostic LLM/tool-calling interface, provider swapping, prompt templates. | Kept, with a sharpened caveat found on re-verification: LangChain now appears in ~34% of agentic-system postings and writeups, which has made it a *saturated* baseline choice rather than a differentiator on its own — so many projects list it that naming it alone doesn't distinguish anything. LangGraph and MCP are the two things shown to still carry real differentiation value in production agent work. Net effect: this doesn't change the choice (LangChain is still the right connective tissue for provider-swapping), but it sharpens the existing "know when to skip the framework" principle below into "and don't stop at LangChain — LangGraph + MCP is where the differentiation actually is." [Source](https://presenc.ai/research/agent-engineer-career-guide-2026) *(industry adoption survey)* |
| **LlamaIndex** *(added)* | Ingestion/indexing layer specifically: parsing and chunking Smogon strategy pages, VGC tournament PDFs/sheets, meta stat exports, and replay logs into well-structured nodes before they hit pgvector. | Re-confirmed 2026: "LlamaIndex for ingestion/retrieval, LangGraph for orchestration" is now explicitly described as *the* standard production pattern (not just "a healthy stack"), even more clearly than at the original research pass — the two frameworks have converged in capability but this hybrid split is still what practitioners converge on. Master Ball's knowledge base is genuinely messy/heterogeneous documents, which is exactly LlamaIndex's strength. [Source](https://www.kunalganglani.com/blog/langchain-vs-llamaindex-2026) |
| **Model Context Protocol (MCP) server(s)** *(added, elevated to first-class)* | Expose Master Ball's core tools (damage calculator, team analyzer, meta lookup, replay parser) as a standalone MCP server, independent of the main chat agent. | Re-verified and, if anything, understated the first time: MCP now has ~97–110M monthly SDK downloads, 17,000+ public servers, and the steepest upward adoption trend of any comparable protocol, and — as of December 2025 — is governed by the Linux Foundation's new Agentic AI Foundation alongside every major lab (Anthropic, OpenAI, Google, Microsoft, AWS). Still the single highest-leverage addition in this whole stack. [Source](https://presenc.ai/research/agent-engineer-career-guide-2026) *(industry adoption survey)* [Source](https://www.paperclipped.de/en/blog/mcp-a2a-protocol-ai-agents/) |
| **Agent2Agent (A2A) protocol** *(new — documented, not adopted)* | Google's complementary protocol for *agent-to-agent* coordination (peer delegation, task handoff), as opposed to MCP's *agent-to-tool* scope. | Worth knowing about, not building yet: A2A was donated to the same Linux Foundation home as MCP in 2025, and the two are now explicitly described as complementary layers, not competitors — "MCP for tools, A2A for agents." Master Ball's current shape (one agent, many tools) is squarely MCP's use case and doesn't need A2A. It would become relevant only if the agent ever splits into genuine peer specialists that delegate to each other (e.g., a dedicated Replay-Analysis agent handing off to a Team-Doctor agent) — noted here as a documented, deliberate "not yet, and here's why" rather than an omission. [Source](https://dev.to/pockit_tools/mcp-vs-a2a-the-complete-guide-to-ai-agent-protocols-in-2026-30li) |
| **Claude (Anthropic) via Amazon Bedrock** *(promoted to primary)* | Primary LLM for agent reasoning/synthesis — team-analysis explanations, replay postmortems, tool-orchestration decisions. | Corrected from the original Gemini-primary call — see "Cloud and model-provider decision, revisited" above. Claude is the enterprise leader specifically for coding/agentic/complex-reasoning workloads, which is what this project's agent actually does, and it's the fastest-growing provider in production adoption. Native on Bedrock, so it lives inside the AWS-primary cloud choice with no separate vendor relationship needed. |
| **OpenAI API** *(promoted to co-primary, not "fallback")* | Router/intent-classification step, high-volume simple tasks, and a first-class provider in the routing layer. | Still the single most-adopted LLM API in production (78% of enterprises), the default target for most frameworks/tutorials/examples, and worth deep fluency in regardless of which model is "best" for any one task. |
| **Gemini API** *(demoted from primary to specialist)* | Used deliberately for its actual strengths: multimodal input (e.g., a photographed/screenshotted team sheet) and bulk/cheap processing of large tournament-report corpora during ingestion. | Kept, not dropped — third place in enterprise spend share and explicitly the weakest of the three for coding/agentic work specifically, but genuinely strong on multimodal and price-per-token at scale, which are real needs here (ingesting a lot of PDFs cheaply). |
| **Pydantic (structured outputs)** | Every tool call, every agent output, every damage-calc result — one typed contract shared with FastAPI's request/response models. | Replaces the vague "structured outputs / tool calling" line item with a concrete choice. This is also explicitly the recommended pattern in current framework-comparison research: a typed agent surface (Pydantic) + LangGraph only where control flow is genuinely graph-shaped, rather than routing everything through heavy framework abstractions by default. |
| **Direct API calls (escape hatch)** *(added as an explicit principle, not a tool)* | For latency-critical or correctness-critical hot paths (e.g., the deterministic damage calculator itself, which should never touch an LLM at all — see below), skip the framework and call the model API directly, or don't call a model at all. | Multiple 2026 practitioner sources independently converge on "mature teams migrate away from heavy frameworks for hot paths." Being able to justify *why* LangGraph is used in one place and a raw call (or no LLM at all) in another is a stronger architectural answer than "we used LangChain for everything." |

**Important product/architecture note:** the damage calculator itself must be a deterministic, unit-tested Python module (ported/adapted from known-good formulas, the same way Pokémon Showdown's calc works) — never an LLM guessing damage numbers. The LLM's job is to *call* that tool and *explain* the result, not compute it. This is a good general example of correctly scoping what an LLM should and shouldn't do.

## RAG / Search

| Tool | Role |
|---|---|
| **PostgreSQL + pgvector** | Primary and, for the foreseeable future, *only* vector store. |
| **LlamaIndex** | See above — the ingestion/chunking layer feeding pgvector. |
| **Knowledge base sources** | Smogon strategy dex + analyses, VGC/regional tournament reports and team sheets, Pikalytics-style usage/meta stats, Showdown replay logs, ROM hack mechanic docs. |

**Kept exactly as originally proposed, and re-confirmed on the 2026 re-verification pass** — "pgvector first, Pinecone/Qdrant only if needed" is, if anything, an even stronger consensus now than at the original research pass, independently repeated across every current comparison checked: pgvector is the default recommendation for the large majority of production RAG workloads (comfortably up to 10–50M vectors, which this project will not come close to), because it avoids running a second stateful service and gets ACID consistency and the same backup/access-control tooling as the rest of the app for free. [Source](https://folarin.dev/blog/choosing-a-vector-database-in-2026) [Source](https://www.digitalapplied.com/blog/vector-databases-for-ai-agents-pinecone-qdrant-2026) Qdrant has emerged as the clearer "move to this specifically" answer if a real limit is ever hit (best price-performance for self-hosted, best at selective metadata filtering), with Pinecone as the fully-managed/zero-ops alternative — both remain a "when we hit a measured limit" option, not a planned migration.

## Cloud

| Tool | Role |
|---|---|
| **AWS ECS on Fargate** (or App Runner for the simplest possible start) | Container hosting for the API and the MCP server. |
| **Amazon Bedrock** | Managed access to Claude (primary) and other hosted models, unified API/IAM/billing. |
| **Amazon RDS for PostgreSQL** | Managed Postgres (with the pgvector extension). |
| **Amazon S3** | Replay logs, uploaded team files, tournament PDFs. |
| **Amazon Redshift or Athena** *(later)* | Once there's enough battle/usage data to warrant real analytical queries (meta trends over time, aggregate win-rate analysis) — the AWS equivalent of the originally-proposed "BigQuery later." |
| **Docker** | Every service is containerized from day one — this is what makes the GCP stretch goal (below) cheap. |
| **GitHub Actions** | CI/CD: tests, lint, eval gate (see Observability), build + deploy. |

**Decision note (corrected from the first draft — see "Cloud and model-provider decision, revisited" above for the full numbers):** AWS is now primary. It's the clear #1 cloud named specifically for AI-agent / LLM stacks (37–44% across four independent 2026 studies, vs. GCP's 23–29%), and "AWS + RAG" has the highest co-occurrence lift of any cloud/skill pairing checked — Bedrock + a Postgres/pgvector RDS instance + S3 + a container runtime is a genuinely common, well-supported production RAG stack. Because everything is Docker-first, a documented stretch goal (see [`roadmap.md`](./roadmap.md)) is to redeploy the same containers to **Google Cloud Run with Vertex AI** without making GCP the foundation the whole project depends on.

## Realtime

| Tool | Role |
|---|---|
| **WebSockets via FastAPI** | Live battle/replay coaching updates, streaming agent output token-by-token. |
| **Streaming AI responses** | Standard SSE/WebSocket token streaming from LangGraph/LangChain. |

Kept as originally proposed, no changes.

## Analytics / Observability

| Tool | Role |
|---|---|
| **LangSmith** | Primary tracing/eval platform. Tightest integration since the agent layer is LangChain/LangGraph-native — this is explicitly the scenario LangSmith is built for. |
| **Langfuse** *(added — compare both, run one)* | Open-source, self-hostable, vendor-neutral alternative. Worth actually standing up (even just locally) specifically to be able to compare it against LangSmith firsthand. LangSmith and Langfuse together are ~56% of eval-tool mentions in 2026 industry surveys — knowing both, and articulating the hosted-vs-self-hosted trade-off, is the practical coverage bar. *(Re-verified 2026: Langfuse was acquired by ClickHouse in January 2026 — capabilities are unchanged and it's still the most-recommended self-hosted/open-source option across every source checked, but worth knowing about if it comes up.)* |
| **RAGAS** *(added)* | RAG-specific offline metrics — faithfulness, context precision/recall, answer relevance — run against a golden dataset. *(Watched, not adopted, on re-verification: **Arize Phoenix** has emerged as a genuinely strong open-source alternative specifically for RAG-quality drift detection — OpenTelemetry-native, free to self-host, with statistical drift tooling RAGAS doesn't have. Not swapped in here because RAGAS is still sufficient for a golden-dataset CI gate at this project's scale, but Phoenix is worth naming as "the thing you'd reach for" if retrieval-quality monitoring over time became a real production concern.)* |
| **promptfoo** *(added)* | YAML-driven prompt regression testing and red-teaming (prompt injection, jailbreak probing), wired into GitHub Actions as a merge gate. |
| **PostHog** | Product analytics (feature usage, funnels) — general product instrumentation, not AI-specific. |
| **Sentry** | Error tracking, both frontend and backend. |
| **Amazon CloudWatch Logs** | Infra-level logs (was "Google Cloud Logging" in the first draft — updated to match the AWS-primary decision above). |

**Why the eval gate matters:** the original stack had production tracing (LangSmith) but nothing that stops a bad prompt change from merging. The 2026-standard pattern named repeatedly in research is exactly "one framework wired into CI as an offline gate (RAGAS/promptfoo/DeepEval) + one platform tracing production (LangSmith/Langfuse), with production failures feeding back into the offline golden dataset." That closed loop is now explicit in this stack.

## Optional ML Layer

| Tool | Role |
|---|---|
| **scikit-learn** | First choice for any classical ML need — e.g., a lightweight "predicted win probability" or "playstyle cluster" model on structured battle stats. |
| **XGBoost** | Once there's a clear tabular-prediction task that needs more than scikit-learn's linear/tree defaults (e.g., matchup win-rate prediction from team compositions). |
| **PyTorch** | Only if a genuine deep-learning need appears (e.g., a sequence model over battle turn history) — not adopted speculatively. |

Kept exactly as proposed — this progression (simple → tabular boosting → deep learning only when justified) matches how production ML engineering is typically practiced: shipping and operating models, not chasing model complexity for its own sake.

## Optional Advanced Layer

| Tool | Role | Status |
|---|---|---|
| **Neo4j** | Knowledge graph of Pokémon ↔ types ↔ moves ↔ abilities ↔ items ↔ common team archetypes. Powers "GraphRAG"-style retrieval (e.g., "what beats a Dragapult + Great Tusk core" is a graph traversal question, not just a similarity-search question). | **Promoted from "later" to a real Phase 2 item** — see [`roadmap.md`](./roadmap.md). Pokémon competitive data is unusually well-suited to a graph model, and GraphRAG is a genuinely current, differentiated 2026 technique. This is a rare case where the trendy technique and the actual domain shape line up. |
| **Kubernetes (EKS)** | Only if/when ECS/Fargate's simpler model genuinely becomes limiting (e.g., needing custom autoscaling policies per-service, or a service mesh). | Stays "later" — Fargate already gives most of the container-orchestration benefit without the operational overhead, which is a defensible reason to *not* reach for k8s prematurely. |
| **Redshift ML / SageMaker** | In-warehouse or managed ML once there's enough data volume to justify it. | Stays "later" (AWS equivalent of the originally-proposed "BigQuery ML later"). |

## Testing (named explicitly — was implicit before)

| Tool | Scope |
|---|---|
| **pytest** | Backend unit/integration tests — especially the damage-calc engine, which needs to be exhaustively tested against known-correct values. |
| **pytest-benchmark** | Performance regression tests on the calc/analyzer hot paths — see "Performance & cost discipline." A calc that's correct but slow still fails the bar this product is held to. |
| **Vitest** | Frontend unit tests. |
| **Playwright** | End-to-end tests (import a team → get analysis → ask a follow-up question, as a full browser flow); also where basic frontend performance checks (e.g., Lighthouse-style budgets) live. |
| **RAGAS + promptfoo** | LLM-specific "tests" — see Observability section. |
