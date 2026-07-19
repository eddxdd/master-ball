# Product Research — Finding the Real Wedge

The original product idea (ChatGPT-generated) described Master Ball as "Smogon + Pikalytics + Showdown analysis + damage calc + replay coaching + tournament prep + a modern Pokédex, in one AI platform." That's a reasonable *category* description but not a differentiated product — most of those things already exist, some of them done well. This doc captures the research into what real competitive Pokémon players are actually frustrated by right now, what's already been built, and where the real gap is.

## The landscape just shifted — this matters a lot

**Pokémon Champions** — a brand-new, official, Pokémon-Company-built game — launched April 8, 2026 on Nintendo Switch and June 17, 2026 on iOS/Android, and immediately became the **mandatory platform for VGC tournament play**, including the 2026 World Championships. [Source](https://champions.pokemon.com/en-us/) This is extremely recent and reshapes the opportunity:

- It's mobile-native from day one (cross-play between Switch and phones).
- It's a closed client — unlike Pokémon Showdown, it does **not** expose battle logs or replays.
- Regulations (rulesets) are actively rotating (Reg M-A → Reg M-B during this research window), so the competitive meta is moving fast and tooling is racing to keep up.
- **Pokémon Showdown is not going away.** It remains the home for OU/singles/community formats, and Smogon has already ported a "Champions" ruleset onto it (with normal text logs, unlike the official game). [Source](https://www.smogon.com/forums/threads/champions-ou-and-any-other-potential-non-vgc-bss-metas-will-still-use-6v6.3780378/) So there are genuinely two overlapping-but-distinct audiences: official Champions/VGC ladder players, and Showdown OU/singles players. Both need tools; Master Ball should serve both.

## Existing competitive landscape (be honest about this)

| Tool | What it covers | Traction |
|---|---|---|
| [ChampTeams.gg](https://github.com/llhtoby38/champteams.gg) | Team builder, Smogon-grade damage calc, speed tiers, a "Battle Mode" second-screen UI for the 90-second team-preview window, AI team-suggestion (Anthropic SDK) | **1,500+ registered users**, solo-built, grown organically via Reddit — notably, built on nearly our exact planned stack (Next.js/React/TypeScript/Tailwind/shadcn/ui/Postgres) |
| [ChampionsMeta.io](https://championsmeta.io/) | Tournament meta hub: usage stats, top teams, tier lists | **21,704+ tournament teams tracked**, updated daily |
| Matchup Trainer (Google Play) | "AI Selection Analyzer" for 3-pick, damage calc, speed comparison | Brand new (May 2026), ~6 total downloads — unvalidated |
| [Pokemon Champions Battle Logger](https://fufufukakaka.github.io/pokemon_champions_battle_logger/) | AI reads an OBS stream or uploaded video and reconstructs a turn-by-turn battle log (built specifically because Champions has no replay export) | Small fan project, free |
| Team Factory, VGC Damage Calc for Champions, Elyss Damage Calculator | Pokédex, team rating, damage calc, offline mode | Established Play Store apps, thousands of downloads each |
| Espeonage, Hindsight, VS Recorder | Showdown-side replay analysis (logs already exist there) | Established open-source/community tools |

**Conclusion:** team builders, damage calculators, and meta-usage dashboards already have real, validated demand — ChampTeams proved 1,500+ organic users will adopt a well-built one with zero paid acquisition. That's a signal to build this *well*, not a reason to avoid it. Being successful here was never about being the only tool in the category; it's about doing the job better than what exists — faster, more accurate, better UX, and (our actual differentiator) backed by a coach that reasons about the output instead of just displaying it. Master Ball's team builder and damage calculator are first-class product pillars in their own right, held to a "best in class," not "good enough for the agent to call," bar — see performance targets in [`tech-stack.md`](./tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have).

**A closer look at ChampTeams specifically, since it's the closest direct competitor** — does it already cover everything you'd look up on Smogon or Bulbapedia (stats, movepool, abilities, natures, types, usage)? Checked directly against its live site and source repo:

- **What it has:** full EV/IV/nature/move/item editing per Pokémon, base and calculated stats, abilities (including Champions-specific ones), full movepools, a complete 18-type coverage matrix, tournament usage % surfaced in the Pokémon picker (cross-referenced with Smogon's own usage stats), speed tiers, and Mega-aware stat changes — all seeded from the same kind of structured Pokémon data source (`@pkmn/dex`) this project would use, plus a damage calc built on `@smogon/calc`, the same engine Showdown's own calculator uses.
- **What it doesn't have, and this is the actual gap:** every one of those data points only appears *while you're actively editing a team slot*. There's no standalone "look up any Pokémon" reference page you can browse independent of team-building — no Bulbapedia-style page you visit just to read about one Pokémon. There's also no written strategy analysis (Smogon's real value-add beyond raw numbers: "why use this set," common teammates, checks & counters, written in prose) — just numbers and tier ranks, no narrative.

**This sharpens the Pokédex pillar below into something more specific than "a Mega-stats quick win":** the gap isn't just "Champions doesn't show Mega stats," it's "no competitive tool treats the Pokédex as a first-class, standalone, browsable thing at all" — every one of them (ChampTeams included) only surfaces this data as a side effect of building a team. A real standalone Pokédex, reasoned over by the AI layer rather than just displayed as a number grid, is a gap nobody in the landscape above has actually closed.

## Validated pain points (each backed by multiple independent sources, not one person's complaint)

### 1. No in-game replay/battle history in Pokémon Champions (biggest, most-cited gap)
Official Pokémon Forums thread asking for this feature, with a company rep replying and acknowledging the feedback: *"I think it would be really helpful if there were a Battle Replay or History feature... Sometimes the matches can go by so fast and mistakes can happen quickly."* [Source](https://community.pokemon.com/en-us/discussion/24518/battle-replay-history-features-to-review-matches-within-pokemon-champions) The community has already improvised a workaround (AI reading screen recordings to reconstruct logs, since there's no other way to get the data) — a strong signal this pain is real and people are willing to go to real lengths to solve it.

**Decision:** this is genuinely the most differentiated, timely opportunity — and also the most expensive to build well (multimodal video understanding) and the most dependent on the user doing something extra (recording their own games, since we cannot capture gameplay for them). Per your call, this becomes a **Premium/later feature**: users upload a recording they already made; we don't attempt any live-capture engineering in v1.

### 2. No standalone, browsable Pokédex reference anywhere in the competitive-tool landscape — Mega Evolution is the sharpest, most-cited example of this
Official forum complaint: *"the only way to know what a Pokémon's ability will be with mega evolution... is to actually do the mega evolution in a match and check the battle summary... your only option is to literally use an unofficial calculator."* [Source](https://community.pokemon.com/en-us/discussion/23780/allow-us-to-inspect-mega-forms-in-pokemon-champions-summary-screens) That specific complaint is the clearest, most official-acknowledged instance of a broader pattern confirmed by directly inspecting the closest competitor: **ChampTeams has all the underlying data (stats, movepool, abilities, natures, types, usage) but only surfaces any of it while you're actively building a team** — there's no page you can visit just to look up one Pokémon the way you would on Bulbapedia or Smogon's own strategy dex. Every tool checked in the competitive landscape above has the same shape: dex-grade data exists somewhere in the product, but always as a side effect of team-building or a damage calc, never as a first-class, standalone reference.

**Decision:** this is bigger than a "quick Mega-stats fix" — it's a genuine, validated gap that a real standalone Pokédex closes. Mega Evolution awareness (pre-computed, displayed stats/ability changes before you ever mega evolve in a real match) is the single sharpest, most concretely-requested capability inside it, and the one with an official dev acknowledgment — but the Pokédex itself is scoped as a full, first-class core pillar of Master Ball, not a feature folded into the Team Builder as an afterthought. See "Resulting v1 product identity" below.

### 3. Tilt / mental-game struggles — large, recurring, and completely unaddressed by any tool
This isn't one person's complaint — it shows up independently in Smogon University's own strategy literature, a 2026 ladder-mentality guide, PokéCommunity forum threads going back years, and formal esports-psychology research. The community's own repeated advice: *"One of the biggest sources of tilt is losing to something you do not understand... When you know exactly why your team lost... the loss feels solvable."* [Source](https://champsdex.com/posts/pokemon-champions-ladder-mentality-guide-2026/) and the "two-loss rule" (stop for 20-30 minutes after two straight losses) is repeatedly cited as the single most effective habit. [Source](https://www.smogon.com/smog/issue5/ladder)

Every existing tool in this space is a calculator. **None of them address the decision-quality/emotional side of playing**, even though the community's own advice keeps pointing exactly there.

**Decision:** this is a genuine, validated, zero-competition gap and becomes a flagship v1 feature — see "Mental-Game Coach" below.

### 4. The 90-second team-preview window is high-pressure, and existing tools only give numbers, not reasoning
ChampTeams already validated this need by building a dedicated "Battle Mode" UI for exactly this moment — but it surfaces damage matrices and speed comparisons, not an explanation. This is where a real conversational agent (not a calculator with an AI label slapped on) differentiates: "lead with X because it outspeeds their likely Trick Room setter and threatens their revealed Mega with a resisted hit" vs. a bare number grid.

**Decision:** flagship v1 feature — see "Conversational Team Doctor" below.

## AI-coaching reception check (are we building something people actually want, or something they'll reject?)

2026 gamer sentiment is split in a specific, useful way: strong rejection of AI *content* (generated art/voice/writing — labeled "AI slop"), paired with strong acceptance of AI used for **replay analysis and player coaching** specifically. [Source](https://cgmedicalcouncil.in/ai-gaming-skepticism-2026/) The one clear line: coaching tools that operate **before or after** a match (prep and review) are broadly accepted; tools that act **during** a live match in ways that resemble automated play assistance start to look like cheating, both reputationally and likely under platform policy. **Design constraint carried into the architecture: Master Ball is a prep-and-review coach, never a live in-battle assistant.**

## Resulting v1 product identity

**Master Ball is one product:** a comprehensive, standalone, genuinely excellent Pokédex/Team Builder/Calculator data core, plus an AI Professor that reasons over that core instead of just displaying it. Neither half is the "real" product with the other bolted on. The competitive tools have to earn their place on their own merits against real, validated-demand competitors (see the landscape above); the AI has to be a genuine value-add on top of that data, not a thin wrapper around a calculator. "Focus on AI" was never meant to mean "neglect the tools" — it means both halves are held to a first-class bar, and the AI's whole job is to make those tools more useful, not to exist instead of them.

**Core pillars — all first-class, all held to a "best in class" bar, not a "good enough" one:**

*Competitive reference and tools:*
1. **Pokédex** — a genuine standalone reference, not a side effect of team-building: base stats, full movepool, abilities, type matchups/weaknesses, a natures reference, and tournament usage % for every Pokémon in the current format, browsable on its own the way Bulbapedia or Smogon's dex pages are — a gap confirmed by directly checking ChampTeams (see above), which has all this data but never surfaces it outside the team-builder flow. **Mega Evolution stat/ability awareness is the sharpest, most concretely-validated capability inside it** — pre-computed and displayed before you ever mega evolve in a real match, directly answering the official, dev-acknowledged complaint above — but it's one capability of a full Pokédex, not the whole feature.
2. **Team Builder & Damage Calculator** — the proven, validated-demand category (see the competitive landscape above). The goal is not to match ChampTeams/ChampionsMeta, it's to beat them on accuracy, speed, and polish — instant (sub-100ms) deterministic calc results, a genuinely fast/responsive UI, and correctness that's exhaustively tested against known values. This is table stakes done exceptionally well, not an afterthought built just so the agent has a tool to call.
3. **Team Analyzer** — type-coverage/speed-tier/role-compression analysis, built on the same Pokédex data, used both directly and as a tool the Conversational Team Doctor calls.
4. **Meta/usage lookup** — leaning on existing public data sources (Smogon usage stats, tournament results) rather than re-deriving everything from scratch, with explicit caching and scheduled/batch refresh (see [`tech-stack.md`](./tech-stack.md)) so it's fast for the user and cheap/sustainable to run, not making live third-party or LLM calls on every page load.

*AI coaching — amplifies the tools above, not a separate product bolted alongside them:*
5. **Conversational Team Doctor** — natural-language reasoning over a team/matchup, grounded in Master Ball's own data (type charts, speed tiers, meta usage, Pokédex profiles), not just a number grid. The layer on top of pillars 1–4 that nobody else has built well.
6. **Mental-Game Coach** — session tracking, proactive "you've lost 2 in a row, take a break?" nudges (push notification), and a post-loss "here's specifically why you lost" breakdown aimed at replacing the "that felt random and unfair" tilt-trigger with actual understanding. Zero existing competitors touch this angle at all.

**Explicitly deferred to Premium/later:** AI video/battle-postmortem analysis (user-uploaded recordings only).

**Audience:** both Pokémon Champions/VGC players and Pokémon Showdown OU/singles players, served by the same core agent and tool engine — the two communities need mostly the same underlying reasoning, just different data sources (official Champions has no replay logs; Showdown does).

## Platform: website (PWA), not a native app — reconsidered after weighing it against the actual project goal

This went through two passes, worth showing both.

**Pass 1** treated "Google Play" as a settled goal and asked only "what's the best way to ship one product as both a website and a Play Store app without two codebases." The 2026-consensus answer to *that specific question* is **Capacitor** (by the Ionic team) over React Native (separate codebase, unneeded for a non-performance-critical app) or a bare PWA/TWA (limited native-API access). [Source](https://ourcodeworld.com/articles/read/3646/pwa-vs-capacitor-vs-native-2026) [Source](https://www.bretcameron.com/blog/react-native-vs-capacitor-why-i-use-both)

**Pass 2** asked the more fundamental question first: should a native/Play Store app be a goal at all, given the project's actual purpose is an AI-engineering portfolio piece? That reframing, plus a direct look at "what's the actual impact of AI on phones — are we wrong to ignore it," changed the conclusion:
- Packaging/shipping a native app teaches **zero** AI engineering skills, and adds real, recurring, non-AI overhead (store account, signing, policy compliance, review cycles).
- The "AI on phones" trend genuinely worth caring about is **on-device/edge inference** — a real, distinct, hot 2026 hiring category (dedicated roles like ML Mobile Engineer / Edge Inference Engineer, built around quantization and local inference runtimes). [Source](https://mobile.wednesday.is/writing/staffing-on-device-ai-enterprise-mobile-team-roles-org-2026) But it's fully reachable from a browser via **WebGPU + Transformers.js/WebLLM** — 2026 sources describe browser-based local inference as having "shifted from novelty to production-ready standard." [Source](https://vadimall.com/posts/transformers-js-v4-webgpu-browser-ai-typescript) So the one legitimate AI-relevant argument for mobile doesn't actually argue for a native app.
- The one genuinely native-locked AI capability is Android's **Gemini Nano via the system-level AICore service** [Source](https://developer.android.com/ai/gemini-nano) — real, but narrow (Android-only, single-vendor), and not worth building a whole app-store distribution pipeline around on its own.
- Two more 2026 data points reinforced staying web-first for *this specific app*: Google Play tightened policy in 2026 for **"AI companion apps"** as a category (longer review, higher suspension risk) [Source](https://androidpwa.com/2026/04/12/android-pwa-vs-google-play-complete-guide-v2/), and **PWAs now out-convert Play Store listings on install rate** (~1.2x) while skipping the review queue and commission entirely. [Source](https://androidpwa.com/2026/06/17/android-pwa-vs-google-play-complete-guide-v2-4/)

**Net decision:** the website, shipped as an installable PWA, is the only committed platform. Capacitor/native packaging stays fully valid as a *how-to* answer and is kept as an explicit, unscheduled Phase 7 stretch goal — it just stopped being a goal worth committing to for what this project is actually for. On-device/edge AI (WebGPU-based) is kept as a *separate*, unrelated stretch goal, since it's the part of the "AI on phones" trend that's actually worth this project's time.

See [`tech-stack.md`](./tech-stack.md#mobile--distribution) and [`architecture.md`](./architecture.md) for how this is wired in.
