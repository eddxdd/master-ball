# Backend structure & conventions

What's actually in [`Backend/`](../../Backend/) and how it's organized. For *why* these tools were chosen, see [`tech-stack.md`](../tech-stack.md); for *how to run it*, see [`setup.md`](../setup.md). This doc is the structural layer — kept in sync with the code as it grows, not a restatement of the planning docs.

## Folder layout

```
Backend/
  app/
    main.py              FastAPI app instance, CORS, lifespan (engine disposal), route registration
    core/
      config.py          Pydantic Settings — the one place env vars are read
    db/
      session.py         Async SQLAlchemy engine/session factory + declarative Base
    alembic/
      env.py             Migration environment, wired to Settings.database_url
      versions/          Migration scripts (tracked in git)
    models/              SQLAlchemy ORM models (Species, Move, Ability, Nature,
                          TypeMatchup, Item, DocumentChunk, BattleLogEntry, PushSubscription)
    schemas/             Pydantic request/response models, one file per feature area
                          (pokemon.py covers Species/Move/Ability/Type detail
                          schemas; items.py is separate — see "Data seeding" below;
                          search.py is the header search bar's contract — see "Global search";
                          rag.py/chat.py are the Phase 2 agent's contracts — see "AI agent (Phase 2)";
                          session.py is the Phase 3 battle-log/push/post-loss-review
                          contract — see "Mental-Game Coach (Phase 3)")
    tools/               The deterministic functions — plain async callables taking a
                          DB session, usable from REST now and the agent/MCP layers later,
                          per architecture.md's "one implementation, three surfaces" rule.
                          retrieval.py (retrieve_context) and embeddings.py are the
                          Phase 2 RAG pieces — see "AI agent (Phase 2)"; battle_log.py
                          and push.py are the Phase 3 pieces — see "Mental-Game Coach (Phase 3)"
    agent/               The LangGraph agent itself (router -> tool_calls -> synthesizer) —
                          graph.py, tools.py (LangChain tool wrappers around app/tools/*),
                          llm.py (provider wiring) — see "AI agent (Phase 2)"
    graph/                Neo4j driver wiring (Phase 6) — session.py (lazy
                          AsyncDriver singleton, run_query helper,
                          GraphUnavailableError) — see "Knowledge graph (Phase 6)"
    ml/                   Phase 7's win-probability toy model — features.py (real
                          per-team feature engineering), simulate.py (the documented
                          SYNTHETIC training-label simulator) — see "Win probability
                          model (Phase 7)"
    mcp/                 The standalone MCP server (Phase 4) — server.py (tool
                          wiring), auth.py (API-key middleware), and its own
                          README.md — see "MCP server (Phase 4)" and
                          app/mcp/README.md itself
    routers/             FastAPI routers, one file per resource (pokedex, moves,
                          abilities, types, items, calculator, team, search, chat,
                          sessions), thin — just request/response wiring around a
                          tools/ or agent/ function
    data/                Small curated/static Python data (damage-calc modifier
                          tables, generation <-> National Dex number boundaries)
                          that isn't worth a DB table, plus
                          pokeapi_client.py (fetches real ability/move
                          descriptions — see "Data seeding" below), its
                          cache/ of fetched JSON, knowledge_base/ (the RAG
                          source documents — see "AI agent (Phase 2)"), and
                          ml/ (the committed, trained win-probability model
                          artifact — see "Win probability model (Phase 7)")
  scripts/
    seed_pokedex.py       One-time, re-runnable seed script (see "Data seeding" below)
    generate_sitemap.py   Generates Frontend/public/sitemap.xml from the seeded DB —
                            see Docs/frontend/README.md's "SEO" section
    ingest_knowledge_base.py  Chunks + embeds app/data/knowledge_base/*.md into
                            pgvector — see "AI agent (Phase 2)"
    generate_vapid_keys.py    One-time helper: generates a VAPID key pair for Web
                            Push — see "Mental-Game Coach (Phase 3)"
    run_mcp_server.py         Entry point for the MCP server (stdio or HTTP) —
                            see "MCP server (Phase 4)"
    load_graph.py             Loads the Neo4j knowledge graph from the seeded
                            Postgres Pokedex + synced usage stats — see
                            "Knowledge graph (Phase 6)"
    train_win_probability_model.py  Trains + saves Phase 7's XGBoost
                            win-probability toy model — see "Win probability
                            model (Phase 7)"
  tests/
    test_health.py
    test_pokedex.py, test_damage_calc.py, test_team.py, ...
    test_agent_graph.py, test_retrieval.py, test_chat.py     Phase 2 agent tests
    test_battle_log.py, test_sessions.py                      Phase 3 tests
    test_mcp_server.py                                         Phase 4 MCP server tests
  pyproject.toml         Dependencies (uv-managed) + Ruff config + pytest config
  uv.lock                Locked dependency versions — commit this, don't gitignore it
  alembic.ini
  Dockerfile             Production-style multi-stage build (see "Docker image" below)
  .env.example
```

## Tools, schemas, and routers — how a feature is structured

Every deterministic feature (Pokédex lookup, damage calculator, team analyzer, and later the RAG/agent tools) follows the same three-layer shape, per [`architecture.md`](../architecture.md)'s "one implementation, three surfaces" principle:

1. **`app/schemas/<feature>.py`** — Pydantic input/output models. These are the actual API contract, and (later) what the LLM tool-calling layer reads.
2. **`app/tools/<feature>.py`** — the real logic, as plain `async def` functions taking `db: AsyncSession` plus typed args, returning a schema object (or `None` for a not-found case). No FastAPI-specific code lives here — this is what makes the same function reusable from REST, the LangGraph agent, and the MCP server without duplication.
3. **`app/routers/<feature>.py`** — thin FastAPI route handlers: pull dependencies (`Depends(get_db)`), call the tool function, translate `None`/a domain exception into the right HTTP status. No business logic here.

Shared logic that more than one tool needs (e.g. the type-effectiveness chart, used by both `get_pokemon_profile` and `analyze_team`) lives in its own `app/tools/<shared_thing>.py` (see `type_chart.py`) rather than being duplicated or awkwardly imported cross-feature.

**One exception to "one router per resource == one tools file per resource":** `get_move_detail`, `get_ability_detail`, and `get_type_detail` all live in `app/tools/pokedex.py` alongside `get_pokemon_profile`/`list_pokemon`, even though each backs its own router (`routers/moves.py`, `routers/abilities.py`, `routers/types.py`). They all query the same `Species`/`Move`/`Ability` tables and reuse `pokedex.py`'s existing helpers (`_type_matchups_for`, `compute_matchups`) — splitting them into three near-empty tool files would fragment genuinely related logic for no benefit. `app/tools/items.py` *is* its own file, because items have no reverse-lookup query to share with anything else.

## Data seeding

`scripts/seed_pokedex.py` populates the `species`/`moves`/`abilities`/`natures`/`type_matchups`/`items` tables from `poke-env`'s bundled Gen 9 data (see [`tech-stack.md`](../tech-stack.md#backend) for why `poke-env`) plus PokeAPI (for description text and, for items, the *entire* data source — see below). Run it with:

```bash
cd Backend
uv run python -m scripts.seed_pokedex
```

It's idempotent (`INSERT ... ON CONFLICT DO UPDATE`) — safe to re-run after a `poke-env` version bump (it auto-syncs from Smogon roughly monthly) to pick up data corrections.

Two real data-quality issues came up building this, worth knowing before touching the seed script again:
- **CAP/non-standard entries.** `poke-env`'s pokedex includes Create-A-Pokémon and other Showdown-community entries alongside real ones, distinguishable only by a non-positive `num` — filtered out via `if num <= 0: continue`.
- **Forme movepools must be *merged* with the base species', not used instead of it.** A forme's own learnset entry is usually just its forme-exclusive move(s) (e.g. Rotom-Wash's own entry is only Hydro Pump) or entirely absent (Mega Evolutions have none). The first implementation treated "the forme has *any* learnset entry" as a reason to skip merging with the base species — which silently produced a 1-move movepool for every Rotom forme (missing Volt Switch, Protect, Will-O-Wisp, everything). Fixed by always unioning the forme's own moves with the base species' moves for any true forme (see `_movepool_for` in `scripts/seed_pokedex.py`) — caught by comparing the Pokédex UI's movepool display against known real movesets, not by a test that happened to only check a species where the bug didn't manifest (Landorus-Therian's *own* issue was different: an empty `eventOnly` entry, which the union-based fix also handles correctly).
- **Egg moves must also be inherited up the *evolution* line, not just across formes.** Showdown's own learnset data lists an egg move only on the earliest stage that can actually breed for it — e.g. Sucker Punch is Pawniard's own entry only; Bisharp's and Kingambit's entries omit it entirely — even though the real games let any evolution of that line know it, and it's real enough to be a top-6 usage-stats move (Kingambit runs it on ~25% of real ladder sets). A fully-evolved Kingambit's own `learnable_moves` was silently missing it, which meant the Team Builder's move picker had no display name to show for an imported "Sucker Punch" set — see `_prevo_inherited_moves` in `scripts/seed_pokedex.py`, which walks a species' `prevo` chain and unions in every ancestor's own gen-legal learnset (mostly only ever adds egg moves in practice, since level-up/TM moves are already repeated on every stage).

### Ability/move descriptions: real data only, never a hardcoded stopgap

`poke-env`'s Showdown-sourced data has ids and mechanics only — no flavor/effect text for abilities or moves. The first pass at this handled the gap by hand-typing a `dict` of descriptions for ~30 common competitive abilities and leaving everything else blank ("Description not yet catalogued." in the UI). **That was the wrong call and was reverted** — this is a production-ready platform, and a Pokédex where most abilities/moves have no description isn't production-ready, it's a demo. Don't reintroduce a hand-typed/partial-coverage dict like that again, here or anywhere else in the app; if a real data source exists, seed from it.

`app/data/pokeapi_client.py` fetches real, complete description text from [PokeAPI](https://pokeapi.co) — the community-maintained REST API most production Pokédex tools use for exactly this — and `seed_pokedex.py` writes it into the `abilities.description`/`moves.description` columns alongside the `poke-env` data. As of the last seed run this covers 313/318 abilities and 932/954 moves (~98%); the handful of misses are Z-move/G-Max signature-move variants, the 18 `Hidden Power` type-variants, and a few Ogerpon forme-specific ability ids that PokeAPI doesn't catalogue as separate entries — a genuine, documented source gap, not a shortcut.

Two things worth knowing if you touch this:
- **This is the only place in the codebase that calls PokeAPI, and it only runs from the seed script — never at request time.** Fetched results are cached to `app/data/cache/*.json` (committed to the repo, so a fresh clone can seed without network access to PokeAPI at all) and only re-fetched when the cache file is missing or `uv run python -m scripts.seed_pokedex --refresh-descriptions` is passed explicitly. This matters for the same reason as the rest of this project's API-usage discipline (see [`tech-stack.md`](../tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)): don't turn a one-time reference-data fetch into a live dependency.
- **Id normalization.** PokeAPI slugs are kebab-case (`"clear-body"`); Showdown/`poke-env` ids strip all separators (`"clearbody"`). `pokeapi_client._to_showdown_id` reconstructs the latter by stripping hyphens from the former — reliable because a hyphen is the only non-alphanumeric character PokeAPI slugs use.

### Items: PokeAPI is the *only* source, not just the description text

`poke_env.data.gen_data.GenData` exposes `pokedex`/`moves`/`natures`/`type_chart`/`learnset` — no items, ever. So unlike ability/move descriptions (where `poke-env` has the item/move itself and PokeAPI only supplies the missing flavor text), for items PokeAPI is the *entire* data source: the `Item` model, the `items` table, and every field on it come from `pokeapi_client.get_items()`.

Scope is deliberately bounded to **battle-relevant held items only** — a curated allowlist of PokeAPI `item-category` slugs (`ITEM_CATEGORIES` in `app/data/pokeapi_client.py`: `held-items`, `choice`, `bad-held-items`, `plates`, `species-specific`, `type-enhancement`, `mega-stones`, `memories`, `in-a-pinch`, `type-protection`, `picky-healing`, `jewels`, `medicine`, `other`), taking *every* item within those categories rather than a hand-picked subset. Explicitly excluded: Poké Balls, actual medicine (Potions/Full Restores — PokeAPI's `healing` category) and vitamins/candies (`vitamins`), key items, TMs, mail, evolution stones (consumed, not held), Nature Mints (consumed), and mechanics this app doesn't model (Z-Crystals, Dynamax Crystals, Tera Shards — the last is an SV overworld currency item despite the name, not a held battle item). As of the last seed run this is 318 items.

Two of those category names are misleading if taken at face value: PokeAPI's `medicine` category doesn't hold actual medicine (that's `healing`/`vitamins`, both excluded above) — it's exactly the ten status/HP-restoring berries (Lum, Sitrus, Oran, Chesto, ...), all real held competitive items. `other` is PokeAPI's catch-all for anything that didn't fit elsewhere, normally too noisy to include wholesale, but as of this writing it holds only five items — the retaliation berries (Enigma/Jaboca/Rowap/Kee/Maranga Berry) — with no junk mixed in. Omitting both was a real seeding gap, not an intentional exclusion: Smogon's usage-stats data only ever gives moves/items/abilities as bare Showdown ids, never display text (unlike teammates/checks), so a missing item showed up as an unresolvable raw id ("lumberry") in the Ladder Usage card and agent tool output rather than a real name — see `app/tools/meta_stats.py`'s `lookup_meta_stats`/`_unresolved_display_name` for both that resolution step and its last-resort fallback for whatever's still missing.

One data-quality wrinkle: a few dozen `mega-stones` entries (`clefablite`, `raichunite-y`, `garchompite-z`, etc. — ~38 of them) are listed in PokeAPI's category index but 404 on their own detail endpoint. These are non-canonical/fan-project entries in PokeAPI's own data (there's no real "Clefablite" — Clefable never got an official Mega Evolution), not something this app can fetch real data for. `_fetch_one_item` detects the 404 and skips that item (logged, not silently dropped) rather than crashing the whole seed — same "gracefully handle missing upstream data" precedent as the sprite-404 handling in `_sprite_url`'s docstring.

**Sprite fallback, and why it can't feed `_is_fabricated_mega`.** PokeAPI's `item.sprites.default` (a flat `sprites/items/<slug>.png` in its backing GitHub repo) is null for ~28 real, often competitively-central items — Booster Energy, Heavy-Duty Boots, Covert Cloak, Loaded Dice, the three Ogerpon masks, both Rusted Sword/Shield, etc. — because that repo also has real art for them one directory over, in generation-versioned subfolders (`sprites/items/gen9/booster-energy.png`) that PokeAPI's own API just never wired up to `default`. `_fetch_one_item` checks those subfolders (newest generation first, via a real HEAD request — never assumed) whenever `default` is null, and uses the first one that resolves as `sprite_url`. Two items (Blank Plate, Legend Plate) and every fabricated mega stone (below) genuinely have no art anywhere in the repo and correctly end up with `sprite_url: null`, same "real gap, not a bug" precedent as everywhere else in this file.

This fallback is *display-only*, though — it must never feed `seed_species`'s `_is_fabricated_mega`, which relies on "has a real PokeAPI sprite" to tell genuine Mega Stones apart from Showdown-bundled fan/CAP ones like "Raichunite X". The generation-versioned folders the fallback checks turn out to *also* carry community fan art for those exact non-canonical stones (real, downloadable PNGs — not a 404 — since the sprites repo doesn't distinguish official from fan content within those folders), so treating fallback-inclusive `sprite_url` as that signal would silently undo the fabricated-Mega filtering above. `_fetch_one_item` therefore reports the pre-fallback flat-directory result separately as `official_sprite: bool`, and `_is_fabricated_mega` checks that instead of `sprite_url`. See `tests/test_seed_pokedex.py` for the regression this guards.

### Min/max stat ranges

`PokemonProfile.min_stats`/`.max_stats` (alongside the existing `.base_stats`) are the theoretical floor/ceiling for each stat at level 100 — the standard "stat range" table every real Pokedex tool shows (Bulbapedia, Serebii, Smogon's own calc): min is 0 IV/0 EV plus a hindering nature, max is 31 IV/252 EV plus a beneficial nature. Computed by `app/tools/stats.py`'s `min_max_stats`, which is just `calculate_stat` (the same function `calculate_damage` and `analyze_team`'s speed-tier logic already use) called twice per stat — **not** a second, independently-maintained formula, so the Pokedex and the Damage Calculator can never quietly disagree on what a stat "means." This is per-stat and hypothetical by design: no single nature actually hinders *and* boosts every stat on the same Pokemon at once, which matches the same convention those reference sites use. HP ignores the nature multiplier entirely (nature never affects HP), including Shedinja's base-HP-of-1 special case, which collapses min and max to the same value (1) since `calculate_stat` already special-cases it.

### Generation filter (Pokedex browser tabs)

`GET /pokedex?generation=N` (`N` in 1-9, validated at the router with `Query(ge=1, le=9)`) filters `list_pokemon` to that generation's National Dex range, backing the Pokedex browser's generation tabs — see [`frontend/README.md`](../frontend/README.md#pokedex-generation-tabs). The generation boundaries themselves (`app/data/generations.py`'s `GENERATIONS`) are static, unchanging game facts (Gen 1 is Dex #1-151, etc. — Gen 9's range extends to 1025 to include the Scarlet/Violet DLC's Pecharunt), not anything derived from the seeded DB, and are intentionally duplicated on the frontend (`Frontend/src/lib/generations.ts`) purely for tab labels — same precedent as `natures.ts`. The backend copy is the one that actually filters, so the two can never disagree on *whether* a Pokemon is in a given generation.

Filtering is a plain `Species.num.between(start, end)` — no separate `generation` column on `Species` — because a forme (Mega, Gigantamax, Alolan, Galarian, Hisuian, Paldean, Therian, ...) always shares its base species' National Dex number, so filtering on `num` alone automatically keeps every forme grouped with its base species' generation with zero extra bookkeeping. An out-of-range/unrecognized generation number reaching `dex_range_for_generation` (which shouldn't happen past the router's `ge=1, le=9` validation, but the function is defensive anyway) returns `None`, treated as "no filter" rather than raising.

### Evolution chain data

`poke-env`'s own pokedex entries already carry `prevo`/`evos`/`evoType`/`evoLevel`/`evoItem`/`evoMove`/`evoCondition` (Showdown's own field names, mirrored 1:1 onto `Species` — no invented denormalization); `seed_species` just wasn't reading them until now. Two things worth knowing:
- **Each species stores its own trigger, not its parent's.** `evos` is only a list of species *ids* — to know *how* `charmeleon` evolves into `charizard`, look at `charizard`'s own `evo_level` (not `charmeleon`'s), because that's the row that stores "how I got here." `app/tools/pokedex.py`'s `_evo_condition_text` + `_full_evolution_chain` encode this directionality; see their docstrings before touching evolution display logic.
- **`evo_type` has a long tail of values** (`trade`, `useItem`, `levelFriendship`, `levelMove`, `levelHold`, `levelExtra`, `other`) that don't all map to a clean sentence — `_evo_condition_text` covers the common cases explicitly and falls back to joining whatever fields are present for the rest ("other"-typed conditions like Alcremie's spin-while-holding-a-Sweet aren't hand-phrased individually).

**`PokemonProfile.evolution_chain` is the species' *entire* line, not just its immediate neighbors.** Early on this was a `prevo`/`evolves_into` pair (one step back, one step forward), which meant viewing a mid-line Pokemon (e.g. Charmeleon) showed the full line, but viewing either *end* (Charmander or Charizard) only ever showed itself plus one neighbor — never the whole line. `_full_evolution_chain` fixes this by walking `prevo` links up to the line's root first, then breadth-first back down through `evos` from that root, returning a list of depth-ordered `EvolutionStage`s (root first). A stage holds more than one `EvolutionRef` only for a branching line (Eevee's eight evolutions all share one previous stage) — this is a tree, not a general graph, since a species has at most one `prevo` but can have several `evos`. Every non-root node's `condition` is computed from that node's own evolution-trigger fields (same `_evo_condition_text`, called per-node); the root's is always `null`. A fully-unevolved, never-evolving species (e.g. Ditto) still gets a chain — just one stage containing itself — rather than an empty/absent field, so the frontend has one consistent shape to check against (`Frontend/src/pages/pokedex/PokemonDetail.tsx`'s `EvolutionChain` treats "one stage, one Pokemon" as "nothing to show").

## Global search

`GET /search?q=...` (`app/routers/search.py` → `app/tools/search.py`'s `search_all`) backs the frontend header's global search box — see [`frontend/README.md`](../frontend/README.md#global-search) for the client side.

- **Deliberately plain `ILIKE`, no trigram/GIN index.** Every table queried here (`Species`, `Move`, `Ability`, `Item`) is small — species/moves each under ~1,500 rows, abilities/items smaller still — so a sequential `ILIKE '%q%'` scan costs well under a millisecond. Adding a `pg_trgm` index now would be optimizing a cost that doesn't exist yet; revisit only if one of these tables grows by an order of magnitude (see the "GIN index" note above for the bar this project actually uses before adding one).
- **Ranking: prefix matches before substring-only matches**, via a single query per model ordering on `CASE WHEN name ILIKE 'q%' THEN 0 ELSE 1 END, name` — a query for `"thunder"` surfaces `Thunder`/`Thunderbolt`/`Thunder Wave` ahead of `10,000,000 Volt Thunderbolt` even though all match, because each kind is capped at `LIMIT_PER_KIND` (6) results.
- **Types are a static in-memory filter over `ALL_TYPES`** (`app/tools/type_chart.py`), not a DB query — there's no `types` table (see the type-chart section elsewhere in this doc), so it's just `[t for t in ALL_TYPES if q.lower() in t.lower()]`.
- **Results are grouped server-side into `SearchResults`** (one list per kind: `pokemon`/`moves`/`abilities`/`items`/`types`), matching the frontend's grouped-dropdown UI one-to-one — the frontend doesn't do any client-side regrouping of a flat result list.
- **Items intentionally have no `subtitle`** in `SearchResultItem` (unlike Pokemon's type(s) or a move's type/category) — there wasn't a short, universally-meaningful second line for the curated battle-item set (see "Items" above), so the field is just left `None` for that kind rather than forcing something in.
- Empty/whitespace-only `q` short-circuits to an all-empty `SearchResults()` before touching the DB at all.

## AI agent (Phase 2)

The "Conversational Team Doctor" — see [`roadmap.md`](../roadmap.md#phase-2--conversational-team-doctor-rag--first-agent) and [`ai-agents-and-rag.md`](../ai-agents-and-rag.md) for the full design rationale. This section covers what's actually implemented and the local-dev-specific decisions that doc doesn't cover.

### RAG knowledge base

`app/data/knowledge_base/*.md` is **original, hand-written strategy content**, not scraped Smogon Strategy Dex text — see that directory's own `README.md` for why (short version: Smogon's analyses are copyrighted editorial content, not an open data feed the way PokeAPI is, and bulk-copying it into this repo would be a real redistribution problem for a project aiming to be production-grade). `scripts/ingest_knowledge_base.py` parses each document's tiny header format, chunks it with LlamaIndex's `SentenceSplitter`, embeds each chunk, and upserts into `document_chunks` (pgvector) — delete-then-insert per `source_id`, so re-running after editing a file is idempotent. Run it with `uv run python -m scripts.ingest_knowledge_base` (or `docker compose exec backend python -m scripts.ingest_knowledge_base` — see [`setup.md`](../setup.md#ingesting-the-rag-knowledge-base-one-time-per-fresh-database)).

**Embeddings are local, not an API call.** `app/tools/embeddings.py` uses `fastembed` (ONNX runtime, no GPU/torch) with `BAAI/bge-small-en-v1.5` (384-dim) instead of an OpenAI/Bedrock embeddings endpoint — a real, good-quality, widely-used open model that runs for free with no API key, which matters twice: retrieval works locally/in tests with zero provider setup, and it matches the "cache/compute locally before reaching for a paid API" principle in [`tech-stack.md`](../tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have). The model file (~130MB) downloads once from Hugging Face and is cached in the `backend_embedding_cache` Docker volume (`Settings.embedding_cache_dir`) — same "fetch once, cache locally" shape as the PokeAPI description cache. `embed_query` vs. `embed_texts` matters: bge models are trained with an asymmetric query/passage distinction, so queries get a different instruction prefix than documents.

`document_chunks.embedding` has an **HNSW index** (`vector_cosine_ops`) — the standard approximate-nearest-neighbor index for pgvector cosine search at any real scale; at this project's current document count (a dozen short documents) it's not yet load-bearing for performance, but it's the correct index to have in place before that changes, not something to retrofit later. `retrieve_context` (`app/tools/retrieval.py`) is a single `ORDER BY embedding <=> :query_vector LIMIT :top_k` query — deterministic given a fixed model and DB state, no LLM call.

### The agent graph

`app/agent/graph.py` implements the router -> tool_calls -> synthesizer graph from `ai-agents-and-rag.md` section 1, built with LangGraph. Three tools are bound to the router (`app/agent/tools.py`): `get_pokemon_profile`, `calculate_damage` (defaults to a 252/252 offensive-defensive EV spread when the caller doesn't specify one, since a chat question rarely comes with an exact spread — the synthesizer is instructed to say so explicitly rather than imply an exact real-game set), and `retrieve_context`. `analyze_team` is **not** bound as an agent tool yet — it needs a full 6-Pokemon `Team` payload that isn't reliably extractable from free text without more scaffolding (structured-output-parsing a pasted Showdown export first); the existing `POST /team/analyze` REST endpoint already covers that flow directly, and composing it into chat is a natural follow-up, not a Phase 2 gap.

**Router vs. synthesizer model split**, per [`tech-stack.md`](../tech-stack.md#cloud-and-model-provider-decision-revisited): the router (cheap/fast, decides which tool(s) to call) uses OpenAI; the synthesizer (the actual grounded explanation) uses Claude. `app/agent/llm.py` is the one place either is constructed — swapping the synthesizer to `ChatBedrock` once real AWS credentials exist later is a constructor change in that module, not a rewrite, which is the specific "provider swap is a config change" property `tech-stack.md` calls out. **Local dev deliberately uses Anthropic's API directly, not Bedrock** — Bedrock needs real AWS credentials this local-only setup doesn't assume yet (see [`roadmap.md`](../roadmap.md)'s "keep things local for now" note); `ANTHROPIC_API_KEY` is the local-dev equivalent.

**No hardcoded stopgap for a missing API key.** If `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` aren't set, `/chat` and `/chat/ws` return a clear `503` (`MissingProviderKeyError` -> `AgentUnavailableError` -> HTTP 503) rather than a mocked/fake answer — same "real data or a clear error, never a stopgap" rule as the ability/move-description decision above, applied to the agent layer.

**Citations.** LangChain tool calls only return string content to the LLM, which loses the structured `RetrievedChunk` data (source id, title, url) a real citation needs. `build_agent_tools`' `retrieve_context` wrapper takes a `citations_sink` list it appends real chunk objects to as a side effect during the graph run — that's how the final API response recovers structured citations without re-parsing the LLM's own prose.

**Conversation history.** `ChatRequest`/the WS payload accept optional `history: [{role, content}, ...]` (prior turns, oldest → newest, excluding the current message). `run_agent`/`stream_agent` prepend those as LangChain `HumanMessage`/`AIMessage`s before the current query (capped to the last 10 turns) so follow-ups like "point me to the page" keep context without a durable server-side session store.

**Site ownership.** The synthesizer prompt includes a Master Ball site map (`/pokedex/{id}`, `/moves/…`, etc.) and instructs the model to prefer internal markdown links over external wikis. `get_pokemon_profile` / meta / scout tool JSON include a `site_path` field; the frontend renders a type-gradient `PokemonShowcaseCard` for `/pokedex/` links (no LLM sprite embedding required).

**Team Builder mode.** `ChatRequest`/the WS payload carry optional `team_builder: bool` + `team: list[str]` fields (the current roster's species ids) that `/team-builder`'s embedded Professor sets — see `Docs/frontend/README.md`'s "Visual Team Builder + Professor team build" section for the frontend side. `run_agent`/`stream_agent`'s `_compose_query` helper prepends `TEAM_BUILDER_INSTRUCTIONS` (asking the agent to end a full-team proposal with a fenced ` ```showdown ` block, reusing the existing `poke_env`-backed Showdown parser rather than a parallel schema) plus the roster line to the raw user message — a plain `HumanMessage` prefix, not an extra `SystemMessage`, since some providers only reliably honor a single system turn. The frontend extracts that block and re-imports it via the same `POST /team/import` the old paste-a-team textarea used.

**Streaming.** `stream_agent` (used by `WS /chat/ws`) uses LangGraph's `astream_events`, but only streams the synthesizer's tokens live. The router's own output can't be shown token-by-token: until the router finishes, it isn't known whether its output is a final direct answer (no tool needed) or is about to be discarded in favor of a tool call — streaming it early risks showing the user text that gets thrown away. The (usually short) direct-reply case is instead sent as one `{"type": "token"}` event once the router has fully decided not to call a tool, followed by `{"type": "done", ...}`.

**Testing without a real provider.** `tests/test_agent_graph.py` substitutes a minimal `FakeToolCallingChatModel` (a `BaseChatModel` subclass returning canned responses) for the router/synthesizer via `run_agent`'s `llm_override` param — a standard LangChain testing pattern (see `langchain_core`'s own `GenericFakeChatModel`), not the "fake data" the real-data rule is about: it verifies the graph's branching/tool-execution wiring is correct, it never ships a fake answer to a real user. `retrieve_context` itself is tested for real (`tests/test_retrieval.py`) against the real seeded knowledge base and a real embedding model — only the LLM steps are faked. Exercising the full graph against a real provider is a manual, opt-in check (set the API keys and hit `/chat`), since it costs real money.

### LangSmith tracing

`Settings.langchain_tracing_v2`/`langchain_api_key`/`langchain_project` are documented, first-class config (see `.env.example`), but LangChain itself reads `LANGCHAIN_*` directly from `os.environ`, not from this app's `Settings` object — `pydantic-settings` loading a `.env` file doesn't itself populate `os.environ`. `app.core.observability.configure_langsmith()` (called once at `main.py` startup via `configure_observability()`) bridges the two, and auto-enables tracing outside `ENVIRONMENT=local` when a key is present. See also Sentry, Langfuse, structured request logs, LLM circuit breakers/fallback, and quality guards in [`Docs/ai-agents-and-rag.md`](../ai-agents-and-rag.md#5-evaluation--observability-loop).

## Mental-Game Coach (Phase 3)

The second flagship feature — see [`roadmap.md`](../roadmap.md#phase-3--mental-game-coach) for the product rationale (the community's own "two-loss rule," found via research, not copied from a competitor). Session tracking is scoped to an **anonymous `client_id`, not a real user account** — nothing here needs to know *who* someone is, just which browser is logging results, so building real auth ahead of that requirement would be infrastructure without a use case (see `roadmap.md`'s Phase 1 scope note for the same reasoning applied earlier).

### Battle log + tilt detection (deterministic, no LLM)

`app/tools/battle_log.py`'s `log_battle_result`/`check_tilt_risk` are the entire "two-loss rule": `check_tilt_risk` walks a client's battle history newest-first and counts a **consecutive-loss streak that resets on any win** — a plain loop, not an LLM judgment call, because "did the last N games go loss/loss?" is a fact, not something worth spending a model call to determine. `TILT_STREAK_THRESHOLD = 2` is the one number implementing the community's rule; `nudge=True` once the streak reaches it. `POST /sessions/battle-log` (`app/routers/sessions.py`) logs the result, runs the tilt check, and (if it fired) attempts a push notification in the same request — all three steps are synchronous and fast (a couple of small indexed queries), so there's no background job here yet.

### Web Push (VAPID, browser-native — no third-party push SDK)

`app/tools/push.py` wraps [`pywebpush`](https://pypi.org/project/pywebpush/) with this project's own VAPID key pair (`Settings.vapid_public_key`/`vapid_private_key`, generated once via `uv run python -m scripts.generate_vapid_keys` and pasted into `.env` — see that script's docstring for why key rotation is a deliberate, manual, run-once action, never automatic). `PushSubscription` (`app/models/session.py`) stores one row per `client_id` (endpoint + the two encryption keys `pywebpush` needs), upserted on `POST /sessions/push/subscribe` and removed on `DELETE /sessions/push/subscribe/{client_id}`.

**`is_push_configured()` gates everything, and its absence is not an error.** If `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` aren't set (the default in local dev — see `.env.example`), `GET /sessions/push/vapid-public-key` returns `{"public_key": null}`, and the frontend treats that as "hide the notification opt-in entirely," not a broken feature — see [`frontend/README.md`](../frontend/README.md#mental-game-coach-phase-3-ui--web-push). `send_push_notification` similarly returns `False` (never raises) on any delivery failure, including simply not being configured — a failed/skipped push must never break the battle-log request it's a side effect of.

### Post-loss explanation flow — reuses the Phase 2 agent, not a second pipeline

`POST /sessions/post-loss-review` (`app/routers/sessions.py`) calls the **exact same `run_agent`** (`app/agent/graph.py`) that backs `/chat`, just with a different opening prompt built by `app/tools/battle_log.py`'s `build_post_loss_prompt` from the logged loss's free-text note. This is deliberate: the agent already has `get_pokemon_profile`/`calculate_damage`/`retrieve_context` bound as tools, so "explain specifically why this loss happened" is just a more targeted version of the same grounded-Q&A capability `/chat` already provides, not a reason to stand up a second LLM pipeline. If the note is empty, the prompt asks the agent to ask one clarifying question back rather than fabricate an explanation from nothing. Same missing-API-key 503 behavior as `/chat` — no hardcoded stopgap here either.

### Testing

`tests/test_battle_log.py` exercises the tilt-detection logic directly against a real DB (no LLM/push involved — deterministic, fast), each test using its own random `client_id` so tests never see each other's rows. `tests/test_sessions.py` covers the HTTP layer (`TestClient`) — request/response shapes, the 204 subscribe/unsubscribe round trip, and the same "no provider keys configured -> 503" and "unknown battle log entry -> 404" paths `test_chat.py` established for Phase 2.

## MCP server (Phase 4)

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server, built with the official Python SDK's `FastMCP` — see [`app/mcp/README.md`](../../Backend/app/mcp/README.md) for the full writeup (architecture, auth, failure modes, MCP Inspector instructions) and [`ai-agents-and-rag.md`](../ai-agents-and-rag.md#4-mcp-server) for the product rationale. The short version, specific to how it fits into this backend:

- **Exposes `get_pokemon_profile`, `calculate_damage`, `analyze_team`, `lookup_meta_stats`, `scout_opponent`, and `suggest_teammates`** — the same `app/tools/*` implementations the REST API and the LangGraph agent already use, per [`architecture.md`](../architecture.md)'s "one implementation, three surfaces" rule. `parse_replay`/the Replay Coach flow aren't exposed (see `app/mcp/server.py`'s module docstring for why — they don't fit this server's fast/synchronous/side-effect-free scope).
- **Typed on both sides.** Every tool's return type annotation is a real Pydantic schema (`PokemonProfile`, `DamageCalcResult`, `TeamAnalysis`), not a bare `dict` — `FastMCP` uses the annotation to generate a real `outputSchema`, so an MCP client gets structured content back, not just prose-shaped text.
- **`scripts/run_mcp_server.py`** runs either transport: `stdio` (default — what Claude Desktop/Cursor launch as a local subprocess) or `--transport http` (Streamable HTTP via `uvicorn`, gated by `Settings.mcp_api_key`'s bearer-token check — see `app/mcp/auth.py`). Same "missing config is visible, not silently open" rule as VAPID/LLM keys: an unset `MCP_API_KEY` logs a startup warning rather than quietly serving unauthenticated forever unnoticed.
- **Tested by calling `FastMCP.call_tool` directly, in-process** (`tests/test_mcp_server.py`) — no subprocess or real network transport needed for the tool-wiring tests, since `FastMCP` exposes tool-calling as a plain awaitable; the auth middleware tests do spin up a real `TestClient` against the Streamable HTTP Starlette app to verify the 401/200 boundary for real.

## Eval loop (Phase 4)

Full writeup, including exact commands, lives in [`Backend/eval/README.md`](../../Backend/eval/README.md) — the short version:

- **`eval/golden/*.jsonl`** — plain, framework-neutral golden datasets checked into git: 12 retrieval queries, 4 chat regression questions, 2 prompt-injection red-team probes.
- **`scripts/run_ragas_eval.py`** — deterministic, no LLM/API cost, runs on every `pytest` invocation (`tests/test_ragas_eval.py`): real `retrieve_context` calls scored with exact source-id recall plus RAGAS's non-LLM `NonLLMContextRecall`/`NonLLMContextPrecisionWithReference` metrics.
- **`scripts/run_llm_eval.py`** — LLM-judged (`Faithfulness`/`ResponseRelevancy`), real API cost per run, deliberately manual/opt-in rather than part of the automated suite — see [`tech-stack.md`](../tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)'s cost-discipline principle for why. Fails loudly (no fabricated score) with a clear message when no provider key is configured.
- **`eval/promptfoo/promptfooconfig.yaml`** — hits the real running `POST /chat` endpoint for regression + red-team checks, independent of the Python scripts above.
- The RAGAS retrieval eval (`tests/test_ragas_eval.py`) runs as a normal part of `uv run pytest`, which `ci.yml` now runs against a real provisioned Postgres — see "CI" below. promptfoo is still deliberately not CI-gated (it needs a running backend plus real, costed provider API keys).

## Knowledge graph (Phase 6)

The "AI-assisted Team Builder" feature — see [`roadmap.md`](../roadmap.md#phase-6--ai-assisted-team-builder-and-graphrag-neo4j) for the product framing. A Neo4j graph, queried for "what pairs well with X, and what does a team built around X still need to cover" — a genuinely multi-hop question that's a natural graph traversal, not naturally a single SQL join or a vector-similarity search (that's the actual case for GraphRAG here, not graph-for-its-own-sake).

**Not a second data source.** `scripts/load_graph.py` builds the graph entirely from data this app already trusts: Phase 1's seeded Pokedex (`Species`/`Move`/`Ability`/`Item`/`TypeMatchup` — `Pokemon`/`Type`/`Move`/`Ability`/`Item` nodes, `HAS_TYPE`/`CAN_LEARN`/`HAS_ABILITY`/`EVOLVES_INTO`/`EFFECTIVE_AGAINST` edges) and, where synced, Phase 5's real Smogon-usage-derived teammate/checks-and-counters data (`PAIRS_WITH`/`COUNTERED_BY` edges, scoped per-format via a relationship property). A format with no synced `UsageStats` rows simply gets no usage edges — not zeroed-out/fabricated ones. Every write is a Cypher `MERGE`, so re-running after `seed_pokedex`/`sync_usage_stats` pick up new data is always safe:

```bash
uv run python -m scripts.load_graph [--format gen9ou]
```

**`app/tools/graph_query.py`'s `suggest_teammates`** is the actual GraphRAG query: given a partial team, it (1) traverses `HAS_TYPE`/`EFFECTIVE_AGAINST` to find which types are super-effective against the current team (`_team_weaknesses`), (2) traverses `EFFECTIVE_AGAINST` again to find types that *resist* those weaknesses, then `HAS_TYPE` to find real Pokemon with those types (`_resist_candidates`), and (3) separately traverses `PAIRS_WITH` from the current team members (`_teammate_candidates`) for real usage-stats co-occurrence. The two candidate sets are merged in Python (not a single mega-Cypher-query) — a resist match and a usage-pairing match are scored/combined additively, and every candidate's `reasons` are plain-English strings traced directly back to the graph edge that produced them (a real `PAIRS_WITH` percent or a real `EFFECTIVE_AGAINST` resist), never a fabricated justification.

**Three surfaces, same tool** — per [`architecture.md`](../architecture.md)'s rule: `POST /team/suggest-teammates` (fast, free, called on every meaningful Team Builder edit — see [`frontend/README.md`](../frontend/README.md#ai-assisted-team-builder-phase-6)), the `suggest_teammates` agent tool (`app/agent/tools.py`, for "who should I add to my team" chat questions, where the LLM adds reasoned prose on top of the same graph-derived candidates), and the MCP server's `suggest_teammates` tool (`app/mcp/server.py`) all call the exact same `app/tools/graph_query.py` function.

**Neo4j is required local infra, not an optional API key** — unlike the LLM provider keys, there's no "gracefully absent" story: `app/graph/session.py`'s `GraphUnavailableError` (raised when Neo4j can't be reached) is caught at each of the three surfaces and turned into a clean `503`/`ToolError`, the same shape as a missing-provider-key error, just for infra rather than config. Community edition (`neo4j:5-community` in `docker-compose.yml`) is enough — no clustering/enterprise feature this app needs.

**Testing** avoids depending on real synced usage-stats data being present (same discipline as `tests/test_meta_stats.py`): `tests/test_graph_query.py` seeds a small, fully synthetic slice of the graph directly via Cypher (unique per-test type/Pokemon names, cleaned up afterward) to deterministically test the resist/pairing/exclusion logic; `tests/test_load_graph.py` runs the real loader against the real seeded Postgres data and asserts it's idempotent. `ci.yml` provisions a real Neo4j service and runs `scripts/load_graph.py` before `pytest` (no live Smogon fetch happens in CI, so CI's graph has real type/movepool data but zero usage edges — exactly the "some graph data, no usage data yet" shape the tests are written to handle gracefully).

## Win probability model (Phase 7)

A small XGBoost model, served **alongside** the LLM-based team analysis (not instead of it) — see [`roadmap.md`](../roadmap.md#phase-7--premium-features-and-stretch-goals)'s item 5. The point of this feature is a specific, defensible interview talking point: this is a structured, numeric, low-latency prediction over engineered tabular features — exactly the kind of task classical gradient-boosted trees are the industry-standard tool for, and an LLM call would be slower, costlier, and no more accurate at.

**The load-bearing caveat, stated up front:** there is no dataset of real logged ladder-match results (team composition → winner) available to this project — building one would mean scraping Showdown replays at a scale far beyond Phase 5's single-replay Replay Coach, or running a genuine self-play simulator (a project of its own). Rather than fabricate random labels, `app/ml/simulate.py` defines one transparent, documented synthetic "battle outcome" function — built from real per-team feature statistics (speed/offense/bulk/type-diversity averages) plus a real cross-team type-matchup advantage term computed from the actual type chart — and samples a winner probabilistically from it, with injected Gaussian noise standing in for everything a 10-number team summary can't capture (movesets, prediction, player skill, crit/damage-roll RNG). **What's real end to end:** the feature engineering (`app/ml/features.py`, computed from actual seeded `Species`/type-chart data), the train/test-split evaluation, and the serving pipeline. What's a demonstration, not a validated real-world claim: the training *labels*. Every surface that returns this model's output (the REST endpoint, the agent tool, the MCP tool) also returns a `model_note` string stating this caveat verbatim — never just a bare number.

`scripts/train_win_probability_model.py` samples random team-A-vs-team-B pairs from the real seeded Pokedex, labels each with the synthetic simulator, trains an `XGBClassifier` (200 trees, max depth 4) on an 80/20 train/test split, and saves the model (`app/data/ml/win_probability_model.json`, **committed to git** — same "small, checked-in artifact" precedent as `eval/golden/*.jsonl`) plus its evaluation metrics (`win_probability_model_metadata.json`):

```bash
uv run python -m scripts.train_win_probability_model [--samples 20000] [--team-size 6]
```

The default 20,000-sample run holds an AUC of ~0.71 on held-out data — meaningfully above the 0.5 chance baseline, which demonstrates the model recovered the (deliberately noisy) synthetic outcome function's real structure purely from labeled team-vs-team examples, without ever seeing the intermediate diff/logit terms `app/ml/simulate.py` computed them from. That's the actual ML-engineering claim this feature makes; it is not a claim that ~71% AUC predicts real human ladder outcomes.

`app/tools/win_probability.py`'s `predict_win_probability` loads the saved model (an `lru_cache`d singleton, same pattern as other in-process caches in this app), computes both teams' real feature vectors, and returns a probability plus each team's feature breakdown — `ModelUnavailableError` (raised if the model artifact is missing) is caught at all three surfaces and turned into a clean `503`/`ToolError`, the same "real infra/setup problem, not a fabricated answer" shape as `GraphUnavailableError`/`MissingProviderKeyError` elsewhere in this app. **Three surfaces, same tool:** `POST /ml/win-probability`, the `predict_win_probability` agent tool (`app/agent/tools.py`), and the MCP server's `predict_win_probability` tool (`app/mcp/server.py`, now 7 tools total) all call the exact same function — per [`architecture.md`](../architecture.md)'s rule.

**Testing** never depends on the real committed model artifact being present or matching a specific version: `tests/test_win_probability.py`, `tests/test_ml.py`, and `tests/test_mcp_server.py`'s win-probability test each train their own small, throwaway model against a temp-file path (asserting the resulting AUC clears a "real signal" bar, not an exact value) — same self-contained-fixture discipline as `tests/test_graph_query.py`'s synthetic Neo4j graph. `ci.yml` additionally runs the real training script once as an end-to-end smoke test (a small `--samples` count, purely for CI speed) — not because the tests need it, but to catch a real regression in the script itself, the same "verified in CI, not just locally" bar `scripts/load_graph.py` is held to.

## CI

`.github/workflows/ci.yml`'s backend job provisions two real service containers — `pgvector/pgvector:pg16` (Postgres) and `neo4j:5-community` — rather than mocking either, since nearly every backend test needs one or both. Setup order matters and mirrors a fresh local `setup.md` walkthrough exactly: `alembic upgrade head` → `scripts.seed_pokedex` → `scripts.ingest_knowledge_base` → `scripts.load_graph` → `scripts.train_win_probability_model` (smoke test) → `pytest`. No live third-party network calls happen in CI (no Smogon usage-stats sync, no real LLM calls) — everything that would otherwise need one is either a deterministic local computation (fastembed's embeddings, the graph loader, the win-probability trainer) or has its own self-contained test fixture (`tests/test_sync_usage_stats.py`, `tests/test_meta_stats.py`, `tests/test_graph_query.py`, `tests/test_win_probability.py`). This exact sequence was verified locally end-to-end against throwaway, freshly-created (no pre-existing state) Postgres/Neo4j containers before landing, both for the initial Postgres-only fix and again after Neo4j was added.

## Conventions

- **Settings, not scattered `os.environ` calls.** Every env-driven value goes through `app.core.config.Settings` (a Pydantic `BaseSettings`), accessed via the cached `get_settings()`. This is also where the app's display name lives (`Settings.app_name`, sourced from `APP_NAME`) — see the root [`README.md`](../README.md#naming--branding) naming convention.
- **Async all the way down.** The DB engine/session (`app/db/session.py`) and route handlers are async — matches FastAPI's/SQLAlchemy 2.0's async-first design and is a real requirement once streaming AI responses and concurrent tool calls show up.
- **`get_db()` is the FastAPI dependency for DB access.** Route handlers that need a session should take `db: AsyncSession = Depends(get_db)`, not construct a session themselves.
- **Tests live in `tests/`, mirroring `app/`'s structure as it grows**, using FastAPI's `TestClient` for route tests and plain `pytest` functions for unit tests (e.g. `test_damage_calc.py`'s hand-verified formula checks). Deterministic, correctness-critical tools (calc/analyzer) additionally get `pytest-benchmark` coverage — a performance regression should fail CI the same way a correctness regression would (see [`tech-stack.md`](../tech-stack.md#performance--cost-discipline-explicit-architecture-principle-not-just-a-nice-to-have)).
- **`TestClient` must be used as a context manager (`with TestClient(app) as client:`) in any test that touches the DB.** A bare `TestClient(app)` at module scope works for a single request but breaks on a second one with "Event loop is closed," because the async SQLAlchemy engine's connection pool is bound to whichever event loop was running when it was first used, and each bare `TestClient` call can spin up a fresh one. Fixed at the source via `app/main.py`'s `lifespan` handler, which disposes the engine's pool on shutdown — but the context-manager pattern in tests is still required to get a clean shutdown per test. See the fixture in `tests/test_pokedex.py` for the pattern to copy.

## Migrations (Alembic)

`app/alembic/env.py` is wired to read `Settings.database_url` directly, rather than a hardcoded URL in `alembic.ini` — so the same migration setup works unmodified across local/Docker/CI/prod, driven entirely by whatever `DATABASE_URL` is in the environment. It also uses the async-engine migration pattern (`run_sync`) since the app connects via `asyncpg`, not a sync driver.

`app/alembic/env.py`'s `target_metadata` is wired to `Base.metadata` (via `from app import models`, which populates it by importing every model module) — so adding a new model just means:
1. Define it under `app/models/`, inheriting from the shared `Base` (`app/db/session.py`) and re-exporting it from `app/models/__init__.py`.
2. Run `uv run alembic revision --autogenerate -m "add whatever table"` and review the generated script before committing it — autogenerate is a good first draft, not a substitute for reading the diff.
3. `uv run alembic upgrade head` to apply it locally.

Watch for one autogenerate footgun: a new `nullable=False` array/JSON column on a table that already has rows (e.g. `Species.evos` when the `species` table already had 1,484 seeded rows) needs a `server_default` added by hand to the generated `add_column` call — the ORM-level `default=list` only fires for new inserts, not existing rows, so the bare autogenerated migration fails on `upgrade` against real data.

`Species.learnable_moves` has a **GIN index** (`ix_species_learnable_moves_gin`, `postgresql_using="gin"`) — added once `get_move_detail`'s "which Pokemon learn this move" became a real `move_id = ANY(learnable_moves)` containment query rather than an in-memory field. GIN is the standard Postgres index type for array/JSONB containment queries; a plain B-tree index doesn't accelerate `ANY()`/`@>` lookups. `Species.abilities` (JSONB) intentionally has *no* special index for the equivalent ability lookup — the table is only ~1,484 rows, so a sequential scan is fine and adding one would be premature.

## Docker image

`Dockerfile` is a multi-stage build following [Astral's recommended uv + Docker pattern](https://docs.astral.sh/uv/guides/integration/docker/): dependencies are synced in a `builder` stage (cached independently of application code changes), then the whole `/app` (venv included) is copied into a slim `python:3.13-slim-bookworm` final stage. The final image does **not** include the `uv` binary itself — only the venv it built — so the container's `CMD`/`docker-compose.yml`'s override command invoke `uvicorn` directly (it's on `PATH` via `/app/.venv/bin`), not `uv run uvicorn`.

For local dev, `docker-compose.yml` overrides the image's default `CMD` with `--reload` and bind-mounts the source tree, plus a separate `backend_venv` named volume mounted at `/app/.venv` specifically to keep the container's own Linux-built venv from being shadowed by the bind mount (which wouldn't be Linux-compatible if it picked up a Windows-built `.venv` from the host anyway). This means **dependency changes require an image rebuild** (`docker compose up --build`) — they aren't picked up automatically the way source code changes are. See [`setup.md`](../setup.md#troubleshooting).
