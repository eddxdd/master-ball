# Frontend structure & conventions

What's actually in [`Frontend/`](../../Frontend/) and how it's organized. For *why* these tools were chosen, see [`tech-stack.md`](../tech-stack.md); for *how to run it*, see [`setup.md`](../setup.md). This doc is the structural layer — kept in sync with the code as it grows, not a restatement of the planning docs.

## Folder layout

```
Frontend/
  src/
    main.tsx             Entry point — mounts <App/>, wraps it in QueryClientProvider + BrowserRouter
    App.tsx               Route table (React Router) — no page content of its own
    App.test.tsx
    index.css             Tailwind entry point + shadcn/ui theme tokens
    sw.ts                  Custom service worker source (Web Push handlers) — see "PWA" below
    vite-env.d.ts          Vite/import.meta.env type augmentations (VITE_APP_NAME, VITE_API_BASE_URL)
    config/
      branding.ts          APP_NAME — the one place the display name is read from
    layout/
      AppLayout.tsx         Nav header + <Outlet/> — the shared shell every route renders inside
    pages/
      HomePage.tsx           "/" — the Phase 0 health-check wiring now lives here
      pokedex/               "/pokedex", "/pokedex/:speciesId"
      moves/                  "/moves/:moveId"
      abilities/              "/abilities/:abilityId"
      types/                  "/types/:type"
      items/                  "/items/:itemId"
      calculator/             "/calculator"
      team-builder/           "/team-builder"
      coach/                   "/professor" (Phase 2 chat) and "/professor/check-in" (Phase 3 check-in)
      NotFoundPage.tsx        "*" catch-all — see "SEO" below
    workers/
      moodWorker.ts            Phase 7's on-device mood classifier (Web Worker,
                             @huggingface/transformers) — see "On-device mood
                             model (Phase 7)" below
    store/
      teamStore.ts            Zustand store for the Team Builder, persisted to localStorage
      themeStore.ts           Zustand store for the light/dark theme toggle, persisted to localStorage
    types/                   Plain TS types mirroring the backend's Pydantic schemas,
                             one file per feature area (pokemon.ts, calculator.ts, team.ts, items.ts,
                             search.ts, chat.ts, session.ts, meta.ts, replay.ts, graph.ts, ml.ts)
    lib/
      api.ts               apiFetch() helper (shared fetch wrapper) + fetchHealth
      pokedexApi.ts, calculatorApi.ts, teamApi.ts, itemsApi.ts, searchApi.ts, mlApi.ts   Typed
                             fetchers per feature area (move/ability/type detail fetchers live in
                             pokedexApi.ts alongside the Pokemon ones — see backend/README.md's
                             matching note on where get_move_detail/etc. live; mlApi.ts is
                             Phase 7's win-probability toy model — see "Win probability
                             (toy model, Phase 7)" below)
      chatApi.ts             streamChatMessage() — WS /chat/ws wrapper for the Phase 2 chat widget
      sessionApi.ts           Battle log + Web Push + post-loss-review fetchers (Phase 3)
      clientId.ts             getClientId() — anonymous client id persisted to localStorage (Phase 3)
      pokemonTypes.ts       The 18 type names, shared across pages
      generations.ts        Generation <-> National Dex number boundaries (tab labels
                             only — see "Pokedex generation tabs" below)
      typeColors.ts         Type -> hex color map + typeTextColor() contrast helper, used by TypeBadge
      natures.ts             The 25 natures — static game data, duplicated client-side
                             on purpose rather than round-tripped just for a dropdown
      utils.ts              shadcn/ui's cn() helper
    hooks/
      useHealth.ts, usePokedex.ts, useItems.ts   TanStack Query hooks, one file per feature area
      useHideOnScroll.ts            Scroll-direction hook backing AppLayout's auto-hide header
      useDebouncedValue.ts           Generic value-debounce hook — see "Global search" below
      useSearch.ts                   TanStack Query hook wrapping useDebouncedValue + searchApi.ts
      usePushSubscription.ts          Web Push permission/subscribe/unsubscribe flow (Phase 3)
      useTeamSuggestions.ts           TanStack Query hook wrapping teamApi.suggestTeammates (Phase 6)
      useOnDeviceMood.ts              Debounced wrapper around workers/moodWorker.ts (Phase 7) —
                             see "On-device mood model (Phase 7)" below
    components/
      ui/                   shadcn/ui components land here
      TypeBadge.tsx, StatBars.tsx, TypeMatchupChart.tsx, MovepoolTable.tsx,
      PokemonSummaryGrid.tsx, PokemonPicker.tsx, StatSpreadInput.tsx   Shared
                             building blocks used across pages
      FeaturedPokemonCard.tsx   Homepage-only card for a knowledge-base-covered Pokemon —
                             see "Homepage" below
      Seo.tsx                 Every routed page renders this once — see "SEO" below
      Breadcrumbs.tsx          Visible breadcrumb nav + matching BreadcrumbList JSON-LD
      SearchBar.tsx            Header global search — see "Global search" below
    test/
      setup.ts               Vitest setup (jest-dom matchers)
  e2e/
    team-to-coach.spec.ts     Playwright E2E flow (Phase 7) — see "End-to-end
                             tests (Playwright, Phase 7)" below
  public/
    favicon.svg
    robots.txt
    sitemap.xml              Generated, not hand-edited — see "SEO" below (gitignored)
  index.html
  vite.config.ts            Vite + Tailwind + PWA + Vitest config, all in one place
  playwright.config.ts      Playwright E2E config (Phase 7) — see "End-to-end
                             tests (Playwright, Phase 7)" below
  biome.json
  components.json            shadcn/ui config (aliases, style, base color)
  package.json
  Dockerfile.dev              Dev-only image (see "Docker image" below)
  .env.example
```

## Conventions

- **`APP_NAME` from `src/config/branding.ts`, never a hardcoded string.** Sourced from `VITE_APP_NAME` with a fallback — this is the frontend half of the naming convention in the root [`README.md`](../README.md#naming--branding). Used for `document.title` and will be used anywhere else the display name shows up in the UI.
- **The `@/` import alias maps to `src/`** (configured in `tsconfig.json`/`tsconfig.app.json` + `vite.config.ts`'s `resolve.alias`), matching shadcn/ui's own convention (`@/components`, `@/lib/utils`, etc. — see `components.json`).
- **Routing via React Router, one `pages/<feature>/` folder per route area.** `App.tsx` only defines the route table (`<Routes>`/`<Route>`); every route renders inside `AppLayout` (nav + `<Suspense>` + `<Outlet/>`). Page modules beyond the landing/404 shell are loaded with `React.lazy` so production builds split them into separate chunks. A page component owns its own data-fetching (via a `hooks/use<Feature>.ts` hook) — it isn't handed data as props from `App.tsx`.
- **Server state via TanStack Query, client/UI state via Zustand.** Every backend call goes through a `hooks/use<Feature>.ts` wrapper around a `lib/<feature>Api.ts` fetcher — never a bare `fetch()` in a component. Zustand is reserved for state that has no server counterpart at all (the Team Builder's in-progress team) — see "Team Builder state" below.
- **shadcn/ui components are vendored into `src/components/ui/`, not imported from a package.** Add new ones with `npx shadcn@latest add <component>` — this copies the component's source into the repo (editable, no black-box dependency), per shadcn's own model. Run this from `Frontend/`, not the repo root — the CLI reads `package.json` from the current directory and will otherwise offer to scaffold a brand-new project.
- **Biome owns both lint and format** (`npm run lint` / `npm run lint:fix` / `npm run format`) — there's no separate ESLint/Prettier config to keep in sync. Vite's own scaffolding tool defaults new projects to a different linter (`oxlint`); that was deliberately swapped out for Biome during Phase 0 scaffolding — see [`tech-stack.md`](../tech-stack.md#frontend) for why.
- **Vitest config lives inside `vite.config.ts`** (the `test` key), not a separate `vitest.config.ts` — one file for both, using the `/// <reference types="vitest/config" />` triple-slash directive for types.
- **Every meaningful page section gets a stable `id`.** Page roots, headers, and each distinct `<section>`/`Card`/form block use a kebab-case `id` scoped by page (e.g. `pokedex-page`, `pokedex-filters`, `team-builder-professor`, `calculator-attacker`). This makes it possible to target a specific part of the UI unambiguously (in conversation, deep-links, `#anchor` scrolling, or e2e tests) instead of describing it by visual position. When adding a new page or section, give it an `id` up front rather than bolting one on later.

## Homepage

`HomePage.tsx` ("/") is a real product landing page, not the Phase 0 health-check stub it started as (that check now lives in a small `HealthChip` at the bottom of the page — useful for local debugging, no longer the headline). Four sections, all real, none decorative:

1. **Hero** — brand wordmark (`Master Ball`), short product pitch, and three CTAs (`Pokedex`, `Team Builder`, `Professor`). Background is a full-bleed stadium photo with a dark overlay (see `HomePage.tsx`).
2. **Professor embed** — live chat panel on the homepage so visitors can try the AI layer without leaving `/`.
3. **Featured OU Pokemon** — one `FeaturedPokemonCard` per Pokemon actually covered by the RAG knowledge base (`Backend/app/data/knowledge_base/*.md`, see [`backend/README.md`](../backend/README.md#ai-agent-phase-2)). Each card fetches its sprite/typing live via `usePokemonProfile(speciesId)` (never hardcoded — if a Pokemon's data changes on re-seed, the card can't drift out of sync) and links into the Pokedex / Professor.
4. **Account CTA + meta dashboard** — signup invite and live usage-stats overview below the fold.

**The `/professor?ask=` deep-link convention:** `CoachPage.tsx` reads an `ask` search param on mount, auto-sends it as the first message exactly once (guarded by a ref, not just component state, so React 19 Strict Mode's double-effect can't double-send), then strips the param back out of the URL via `setSearchParams` so refreshing or sharing the resulting `/professor` link doesn't re-fire it. `send` is wrapped in `useCallback` specifically so this effect's dependency array can be exhaustive (`[searchParams, send, setSearchParams]`) without the effect re-running on every render — any other page that wants to deep-link into a specific question (e.g. a future Pokedex "ask about this Pokemon" button) can reuse this same `?ask=` param for free.

## Theming & Design System

All theming lives in [`src/index.css`](../../Frontend/src/index.css) as CSS custom properties — there is no `tailwind.config.*` (Tailwind v4's CSS-first config, wired up via `@tailwindcss/vite` in `vite.config.ts`). The `@theme inline` block maps each `--foo` variable to a `--color-foo` Tailwind theme entry, which is what makes `bg-primary`, `text-muted-foreground`, `border-border`, etc. work as real utility classes. Adding a brand-new semantic color means adding it in three places: the `:root` block, the `.dark` block, and a `--color-*` line in `@theme inline`.

**Palette: Master Ball inspired.** `--primary` is a deep violet-purple, `--accent` is a magenta/pink (the ball's band), `--ring` is a pale sky-blue (the ball's button) used for focus rings. `--success`/`--warning` (plus their `-foreground` pairs) were added alongside the pre-existing `--destructive` so status colors are tokens too — don't reach for a hardcoded `text-emerald-*`/`text-amber-*` class for a new success/warning message, use `text-success`/`text-warning`. `--gradient-brand` (purple → magenta) and `--gradient-accent` (purple → sky-blue) are plain CSS `linear-gradient()` values, consumed via Tailwind arbitrary values like `bg-[image:var(--gradient-brand)]` (for fills) or `bg-[image:var(--gradient-brand)] bg-clip-text text-transparent` (for gradient text) — they're deliberately *not* registered in `@theme inline` since they're not flat colors.

**Gradients are used deliberately, not everywhere:** the brand wordmark (`AppLayout`), the homepage hero heading, the `gradient` button variant (used for the primary CTA on each feature page — "Calculate damage", "Analyze team", "Import team"), and a small set of "hero" surfaces that earn extra visual weight — the damage-calculator's page header and its result panel's headline number (`CalculatorPage`/`DamageResult`), and the Pokedex's usage-stats card header (`UsageStatsCard`, `--gradient-accent`, distinguishing it from the calculator's `--gradient-brand`). Everything else (cards, borders, most buttons, badges) still stays flat/solid — the rule isn't "no gradients outside these five spots," it's "a gradient marks a genuinely prominent moment, not routine chrome," and each new use should be able to explain which moment it's marking. One exception unrelated to prominence: `--gradient-page` is a subtle, low-chroma diagonal wash applied to `body` (`bg-[image:var(--gradient-page)] bg-fixed`, see `@layer base` in `index.css`) so the whole app has a soft gradient backdrop rather than a flat fill — `AppLayout`'s outer wrapper deliberately has no `bg-background` of its own so this shows through, and `AppLayout`'s `<header>` is given its own solid `bg-card` specifically so it reads as a distinct surface sitting on top of that backdrop rather than blending into it.

**Dark is the default theme, with a light theme + toggle.** This required one deliberate architecture decision: rather than flipping which selector represents which theme, `:root` still holds the *light* palette and `.dark` still holds the *dark* palette — unchanged from the shadcn default — because the vendored shadcn primitives (`button.tsx`, `input.tsx`, `select.tsx`, `checkbox.tsx`, `textarea.tsx`) already have hardcoded `dark:` variant classes (via `@custom-variant dark (&:is(.dark *))`) that assume that convention. Instead, "dark by default" is enforced at the JS layer:
- [`src/store/themeStore.ts`](../../Frontend/src/store/themeStore.ts) is a Zustand `persist` store (same pattern as `teamStore.ts`) holding `theme: "dark" | "light"`, defaulting to `"dark"`, persisted to `localStorage` under `masterball-theme`.
- `App.tsx` has a `useEffect` that toggles the `.dark` class on `document.documentElement` whenever `theme` changes (handles the toggle button and any state restored after mount).
- [`index.html`](../../Frontend/index.html) has a small inline `<script>` in `<head>` that reads the *same* `masterball-theme` localStorage key and applies the `.dark` class *before* React ever mounts (or CSS paints) — without this, every reload would flash light-then-dark, since the persisted Zustand state isn't read until React hydrates. If the persist key name in `themeStore.ts` ever changes, this script must be updated to match.
- The toggle itself is a Sun/Moon icon button (`lucide-react`) in `AppLayout`'s header, calling `useThemeStore().toggleTheme()`.

**Scrollbars are styled globally, theme-aware, via plain CSS in `index.css`'s `@layer base`** — thin, rounded, transparent-track, using two new tokens (`--scrollbar-thumb`/`--scrollbar-thumb-hover`, defined per-theme like every other color) rather than hardcoded values, with the hover state resolving to `--primary` for a small on-brand touch. Both engines are covered: `scrollbar-width`/`scrollbar-color` for Firefox, `::-webkit-scrollbar*` pseudo-elements for everything else. These two tokens are deliberately not registered in `@theme inline` (same reasoning as `--gradient-*`) since nothing needs a Tailwind utility class for them — they're only ever read via `var()` in this one place.

**Pokemon type colors (`typeColors.ts`) are separate from brand theming and are not tokenized** — they're the 18 canonical Pokemon-type hex colors (Fire orange, Water blue, etc.), which are domain reference data, not a design choice. `TypeBadge` now also calls `typeTextColor(type)`, a small WCAG relative-luminance check that picks black or white text per badge (several type colors, like Electric's yellow, are too light for the previously-hardcoded white text) plus a subtle border for separation against the dark background.

## Sticky, auto-hiding header

`AppLayout`'s `<header>` is `sticky top-0` (stays pinned once the page scrolls past it) plus a `transition-transform` that slides it fully off-screen (`-translate-y-full`) while scrolling down, and back on-screen the moment the user scrolls up at all — the common "nav steps aside while reading, one upward scroll away" pattern (YouTube/Medium use the same one). The scroll-direction logic lives in [`src/hooks/useHideOnScroll.ts`](../../Frontend/src/hooks/useHideOnScroll.ts): it reads `window.scrollY` inside a `requestAnimationFrame`-throttled scroll listener (never on every raw scroll event) and returns a single `hidden: boolean`, always `false` within `threshold` pixels of the top so the header never hides on a page that barely scrolls. `AppLayout` just maps that boolean to a Tailwind class — no other component needs to know about scroll state.

## Team Builder state (Zustand + localStorage)

`src/store/teamStore.ts` holds the in-progress team entirely client-side, persisted via Zustand's `persist` middleware to `localStorage` (key: `masterball-team-builder`) — **not** a server-side `teams` table. This isn't a shortcut: `analyze_team`'s REST contract takes a full team payload directly, not a `team_id` (see [`Docs/roadmap.md`](../roadmap.md)'s Phase 1 scope note), so there's nothing on the server to persist to yet. Real account-backed team storage arrives in Phase 3, once session logging actually needs a user identity.

`addMemberWithSpecies(speciesId)` is a second "add" action alongside the plain `addMember()` — a single `set` call that appends a new slot pre-filled with a species rather than an empty one, used by `TeamSuggestionsPanel`'s "Add to team" button so the new slot never renders with an empty `species_id` even momentarily.

## Visual Team Builder + Professor team build

`/team-builder` ([`src/pages/team-builder/TeamBuilderPage.tsx`](../../Frontend/src/pages/team-builder/TeamBuilderPage.tsx)) leads with an embedded Professor that can build/fill a team directly, backed by a fully visual, sprite-forward slot editor — there is no paste-a-Showdown-export textarea on this page anymore (the backend `POST /team/import` endpoint it used still exists and now backs the Professor's apply-team action instead — see `backend/README.md`).

- **`TeamSlotEditor.tsx`** renders each of the (up to 6) roster slots as a collapsed sprite tile by default (species sprite, name, type badges, and a best-effort item-sprite overlay), expanding in place into the full set editor — species/item/ability/nature/Tera/EVs/moves — when tapped. At most one slot is expanded at a time (`TeamBuilderPage`'s `expandedIndex` state); the expanded card spans the full grid width (`col-span-full`) so its fields have room. The tile itself is a `role="button"` `<div>`, not a real `<button>`, because it contains a nested "Remove" `<button>` — nested interactive elements are invalid HTML.
- **[`src/components/SpeciesCombobox.tsx`](../../Frontend/src/components/SpeciesCombobox.tsx)** is the sprite-forward species picker used inside the expanded slot editor — built on the same `Combobox` primitive as `SearchBar`, scoped to `GET /pokedex?search=...` results, but (unlike `SearchBar`) *does* hold its selection so the input keeps showing the picked name. `PokemonPicker.tsx`'s plain `<datalist>` version is untouched and still backs the Damage Calculator's attacker/defender pickers — it wasn't upgraded since the Calculator was out of this redesign's scope.
- **[`src/components/ItemCombobox.tsx`](../../Frontend/src/components/ItemCombobox.tsx)** still stores the held item as plain display text in `PokemonSet.item` (typing freely always works, exactly like the plain `Input` it replaces — see `backend/README.md`'s note on why `item` isn't an id-keyed field), but adds a searchable sprite dropdown via `GET /search` for anyone who'd rather pick. Its exported `useItemSpriteGuess` hook approximates the backing item id from that display text via `toShowdownId` (`src/lib/utils.ts`, the reverse of `humanizeShowdownId`) for a best-effort sprite lookup — a 404 (wrong guess) is treated as "no sprite," not an error (`retry: false`), and both the item field and the collapsed tile's item-sprite overlay reuse this same hook rather than duplicating the guess logic.
- **Tera type** now offers the full 18-type list (`Object.keys(TYPE_COLORS)`), not just the selected Pokemon's own two types — Terastallizing into an off-type is a real, common competitive choice.

## AI-assisted Team Builder (Phase 6)

`TeamSuggestionsPanel` ([`src/pages/team-builder/TeamSuggestionsPanel.tsx`](../../Frontend/src/pages/team-builder/TeamSuggestionsPanel.tsx)) sits on the Team Builder page below the slot editors, showing live, graph-derived teammate suggestions as the team changes — see [`backend/README.md`](../backend/README.md#knowledge-graph-phase-6) for the Neo4j/GraphRAG design this surfaces.

- **`useTeamSuggestions`** is a plain TanStack Query hook keyed on the current team's (sorted, deduplicated) species ids, calling `POST /team/suggest-teammates` — this is a fast Neo4j traversal, not an LLM call, so it refetches on every meaningful edit with no debounce/cost concern, unlike e.g. the header search box.
- **Every candidate's `reasons` are rendered verbatim**, not re-summarized client-side — they're already plain-English strings the backend traced directly back to a real graph edge (a usage-stats pairing percent or a type-weakness resist), and re-phrasing them client-side would risk drifting from what the graph actually found.
- **Renders nothing** (not an error state) when the team is empty or already full (6/6, since there's no open slot to suggest into) — same "absent, not broken" convention as `UsageStatsCard` for an unsynced Pokemon.
- **A 503 (Neo4j unreachable) surfaces as a normal inline error message**, not a crash — same pattern as every other optional-infra failure mode in this app (missing LLM provider keys, unconfigured VAPID keys).
- **Each candidate has an "Add to team" button** calling `TeamBuilderPage`'s `handleAddSuggested`, which appends the candidate via `teamStore`'s `addMemberWithSpecies` and opens that new slot's expanded editor immediately — the natural next step after "add" is almost always "now set its item/moves." Suggestion candidates also link to their own Pokedex detail page (`/pokedex/:speciesId`) for anyone who just wants to read up on it first.

## Win probability (toy model, Phase 7)

`WinProbabilityPanel` ([`src/pages/team-builder/WinProbabilityPanel.tsx`](../../Frontend/src/pages/team-builder/WinProbabilityPanel.tsx)) sits on the Team Builder page below the GraphRAG suggestions panel — see [`backend/README.md`](../backend/README.md#win-probability-model-phase-7) for the full "toy model, synthetic training labels" design note this UI is built around.

- Paste an opponent's Showdown export (via the same `importTeam` parser the Professor's apply-team action also uses, just without writing the result into the shared team store), then request an estimate — `POST /ml/win-probability` (`src/lib/mlApi.ts`).
- **The API's `model_note` string is always rendered verbatim** directly under the probability bar, in the same interaction — this is a deliberate choice to never present a bare percentage without its "trained on a synthetic simulator, not real match data" caveat next to it.
- A missing/untrained model surfaces its `503` as a normal inline error message, same convention as every other optional-infra failure mode in this app.

## Pokedex generation tabs

`PokedexBrowser` groups the whole National Dex into a horizontal tab strip — "All" plus one tab per generation ("Gen 1" ... "Gen 9") — built on `src/components/ui/tabs.tsx` (`@base-ui/react`'s Tabs primitive, added via `npx shadcn@latest add tabs`), the same vendoring pattern as every other shadcn/ui component here.

- **Generation boundaries (`src/lib/generations.ts`) are static data, not fetched** — a plain array of `{ number, region, start, end }`, mirroring [`backend/README.md`](../backend/README.md#generation-filter-pokedex-browser-tabs)'s `app/data/generations.py`. This copy exists purely to render tab labels/titles ("Gen 3", tooltip "Hoenn") — the actual filtering happens server-side via `GET /pokedex?generation=N`, so a label typo here can't produce an incorrect result set, only a wrong-looking label.
- **One `TabsContent` panel, always bound to whatever tab is currently active** (`<TabsContent value={generationTab}>` where `generationTab` is the same state driving `Tabs`'s own `value`) rather than one panel per tab. This is deliberate: every tab shares the exact same content (the same search box, type filter, and `PokemonSummaryGrid`, just with a different `generation` query param), so rendering 10 near-identical panels (one of which happens to be visible) would be pure duplication. Binding the single panel's `value` to the live active-tab state keeps it "always the active panel" by construction, while still giving the tablist proper ARIA tab/tabpanel semantics — a valid Base UI pattern for tabs that filter one shared view rather than switch between genuinely different ones.
- **The tab list scrolls horizontally on narrow viewports** (wrapped in a plain `overflow-x-auto` div) rather than wrapping to a second line or being cut off — with 10 tabs, wrapping would push the search/filter row down unpredictably depending on viewport width, and a horizontal scroll is the more familiar mobile pattern for a long tab strip (same idea as a mobile OS's own settings-category tabs).
- **Generation filtering combines with the existing search/type filters** (an AND, not an OR) — picking "Gen 3" then typing "sala" narrows to Gen 3 Pokemon matching "sala", not either condition alone. All three (`search`, `type`, `generation`) are independent `useState`s passed straight through to `usePokedexList`.
- **A live "N Pokemon · Region (Gen X)" count** sits to the right of the search/type row, so switching tabs or narrowing a search gives immediate feedback on how many results remain — reusing the same `activeGeneration` lookup that drives the tab list itself, not a second source of truth for the region name.

## Min/max stat ranges (`StatBars`)

Every base-stat bar on `PokemonDetail` (including each Mega Evolution forme's own nested stat block) shows the stat's real min/max range at level 100 directly beneath its bar, plus a one-line caption explaining the assumptions. The numbers come straight from the API's `min_stats`/`max_stats` fields on `PokemonProfile` — `StatBars` is a pure display component and does **not** recompute the formula itself; see [`backend/README.md`](../backend/README.md#minmax-stat-ranges) for where that logic actually lives (and why it's shared with the Damage Calculator rather than duplicated). If a future page ever needs this same range without a full profile fetch, extend the backend's `min_max_stats` call site rather than re-deriving the formula in TypeScript.

**Each bar's fill color is computed from its own value, not a flat brand color** — `statHue()` interpolates a bar's hue between red (at or below 50) and green (at or above 150), so a glance at a stat block reads "which stats are actually good/bad" the way a health bar or a spreadsheet's conditional formatting would, rather than every stat looking identical regardless of whether it's 255 or 5. The numeric value label picks up the same hue for consistency. This is a deliberate, data-driven exception to "flat colors everywhere except brand moments" (see "Theming & Design System" below) — the color *is* the information here, not decoration.

## Cross-linked reference pages (moves/abilities/types/items)

Every move, ability, and type shown anywhere in the app is a link to a dedicated detail page (`/moves/:moveId`, `/abilities/:abilityId`, `/types/:type`) showing that entity's own info plus every matching Pokemon — the same `PokemonSummaryGrid` component (extracted from `PokedexBrowser`'s card grid) is reused on all three pages, plus `PokemonDetail`'s Mega Evolution list conceptually being the fourth consumer of "a grid of Pokemon cards." Items (`/items/:itemId`) get a detail page too, but aren't linked from anywhere yet — no existing UI surface displays an item *name* (the Calculator/Team Builder's item field is free-text input, not a display), so items are reachable by direct URL/API only until a real item picker exists.

**`TypeBadge`'s `linkable` prop (default `true`) exists to avoid nested `<a>` tags.** Every type badge is a link to its type's detail page by default — except `PokemonSummaryGrid`, which already wraps the whole card (badges included) in a `<Link to="/pokedex/:id">`; nesting another `<Link>` inside breaks click targeting and is invalid HTML, so that one call site explicitly passes `linkable={false}` on both badges. If you add a new place that renders a `TypeBadge` inside another link/card, do the same.

**Evolution chain UI (`PokemonDetail`'s "Evolution" card) always shows the full line, not just a Pokemon's immediate neighbors.** It reads `PokemonProfile.evolution_chain` — a list of depth-ordered `EvolutionStage`s (root first), each holding one or more `EvolutionRef`s (`id`, `name`, `sprite_url`, `condition`; more than one only for a branching line like Eevee's evolutions). `condition` is pre-formatted server-side (see `backend/README.md`'s evolution data section for the "each species stores its own trigger" directionality and how the full chain is walked) — the frontend just renders whatever condition string each node is given, never re-deriving evolution logic from raw `evo_type`/`evo_level` fields (those aren't even sent to the client). `EvolutionChain` renders one column per stage (a stage's multiple Pokemon, for a branch, stack vertically within that column, each with its own arrow+condition), and highlights whichever node's `id` matches the profile currently being viewed — so viewing Charmander, Charmeleon, *or* Charizard all render the identical three-stage line, just with a different node highlighted. The card renders nothing when the chain is a single stage with a single Pokemon (no prevo, no evolutions).

## Global search

`AppLayout`'s header has one search box (`src/components/SearchBar.tsx`) that finds Pokemon, moves, abilities, items, and types by name and jumps straight to that entity's detail page — the single "find anything" entry point referenced by the root [`README.md`](../README.md)'s core-pillars framing of the Pokédex.

- **Backend does the searching, not the frontend.** `SearchBar` calls `GET /search?q=...` (via `lib/searchApi.ts`) and renders exactly what comes back — see [`backend/README.md`](../backend/README.md#global-search) for the query/ranking logic. There's no client-side fuzzy-matching library and no full dataset shipped to the browser; this keeps the bundle small and means ranking logic lives in exactly one place.
- **Built on `@base-ui/react`'s Combobox** (vendored at `src/components/ui/combobox.tsx`, added via `npx shadcn@latest add combobox`), not a hand-rolled dropdown — this gets full keyboard navigation (arrow keys, Enter, Escape) and ARIA combobox semantics for free. Because filtering is server-side, the Combobox's own client-side filtering is explicitly disabled (`filter={null}`, `autoComplete="none"`) — whatever `items` is passed in is exactly what renders, no re-filtering.
- **Debounced, not fired on every keystroke.** `useDebouncedValue` (250ms) sits between the raw input state and `useSearchResults` (a thin TanStack Query wrapper around `fetchSearchResults`), so typing a full word triggers one request, not one per character.
- **Results are grouped by entity kind** (Pokemon / Moves / Abilities / Items / Types), matching the backend's `SearchResults` shape one-to-one — each group's key doubles as the route prefix (`/pokedex`, `/moves`, etc.) `SearchBar` navigates to on selection (`navigate(`${path}/${id}`)`).
- **The Combobox's `value` is always controlled back to `null`.** This search box never "holds" a selection the way a typical combobox does — once you've picked a result and navigated away, there's nothing meaningful left to keep selected. Explicitly resetting `value` to `null` (rather than just clearing the input's own local state) is what stops Base UI from re-filling the input with the picked item's label right after the navigate-and-clear — a real gotcha hit while building this: `setQuery("")` alone did not survive Base UI's own internal value-sync.
- **`ComboboxInput` gained a leading `icon` prop** (a small addition to the vendored `combobox.tsx`) purely so `SearchBar` can render a `SearchIcon` inside the input without forking the whole component.

## SEO

**Every routed page must render `<Seo title="..." description="..." />` — this is a standing convention, not a one-time pass.** When adding a new page/route, add its `<Seo>` call in the same PR, the same way every existing page in `App.tsx`'s route table does. Reviewers/agents should treat a new page with no `<Seo>` the same as a new backend field with hardcoded placeholder data — see the root [`README.md`](../README.md)'s "Data integrity" principle for the general version of this rule.

**Why no `react-helmet`/`react-helmet-async`:** React 19 has built-in support for rendering `<title>`, `<meta>`, and `<link>` tags anywhere in the component tree — React hoists them into `<head>` itself, no extra library needed. [`src/components/Seo.tsx`](../../Frontend/src/components/Seo.tsx) wraps this in one component per page:
- `title` — `Seo` appends `| Master Ball` itself; pass just the page-specific part (e.g. `"Damage Calculator"`, not `"Damage Calculator | Master Ball"`).
- `description` — for detail pages (Pokemon/move/ability/item), built from real data already on hand (stats, type, PokeAPI description text) rather than being hand-written per entity — see e.g. `PokemonDetail.tsx`'s `profileDescription()`. There is no per-entity SEO-description field anywhere in the backend; don't add one just for this.
- `noindex` — set on error/not-found states (e.g. "couldn't find that Pokemon") and on `NotFoundPage`, so a stale/typo'd URL doesn't get indexed as real content.
- `jsonLd` — optional, for structured data (`Breadcrumbs` uses this internally; see below).
- Canonical/OG/Twitter URLs are derived from `window.location` at render time, **not** a hardcoded site URL — the production domain isn't decided yet (see [`tech-stack.md`](../tech-stack.md)), and this way it's automatically correct in every environment (localhost, a preview deploy, or the real domain later) with zero config.

**Why `index.html` has no static `<meta name="description">`/OG/Twitter tags, only a fallback `<title>`:** React 19 only manages `<title>` as a true singleton — a page's `<Seo>`-rendered title cleanly *replaces* `index.html`'s static one, verified by test (`App.test.tsx`). `<meta>` tags are not deduplicated against markup React didn't render itself: a static `<meta name="description">` in `index.html` would end up coexisting *alongside* each page's real one rather than being replaced by it, and most parsers (browsers, Facebook's OG parser, etc.) use the *first* matching tag in document order — meaning every single page would incorrectly advertise the generic homepage description instead of its own. Learned by inspecting rendered `<head>` output in the browser after first wiring this up, not by inspection of the React docs alone — if you're ever tempted to add a static fallback meta tag to `index.html` "just in case", check `document.querySelectorAll` for duplicates before assuming it's safe.

**Breadcrumbs (`src/components/Breadcrumbs.tsx`):** every detail page (move/ability/type/item/Pokemon) renders `<Breadcrumbs items={[...]} />`, which renders both the visible `<nav aria-label="Breadcrumb">` trail *and* a matching `BreadcrumbList` JSON-LD `<script>` block from the same data — kept as one component specifically so the visible and structured versions can't drift apart (search engines penalize that mismatch). An item with no `to` renders as plain text — used for category levels with no browse page of their own (e.g. "Moves", "Abilities" — see the root README's explicitly-out-of-scope note on standalone browse pages).

**`NotFoundPage` (route `"*"` in `App.tsx`) is a client-side-only 404** — it renders `<Seo noindex />` and a friendly message, but this is fundamentally still an HTTP 200 response, since a pure client-rendered SPA has no way to set a real response status for a route the server doesn't know about. Whatever ends up serving the production build needs its own catch-all rewrite to `index.html` (standard for any SPA) — if that server can *also* be configured to return a genuine 404 status for unmatched deep-link paths specifically (rather than 200), that's strictly better for SEO and worth doing once a hosting choice is made, but isn't achievable from the frontend code alone.

**Sitemap (`Frontend/public/sitemap.xml`, gitignored) is generated, not hand-written or committed**, by [`Backend/scripts/generate_sitemap.py`](../../Backend/scripts/generate_sitemap.py) — it queries the seeded `species`/`moves`/`abilities`/`items` tables directly (same DB access pattern as `seed_pokedex.py`) and writes one `<url>` entry per static route plus every Pokemon/move/ability/type/item detail page (~3,000 URLs total). It's gitignored rather than committed because it requires the real production domain as a `--site-url` argument, which isn't decided yet — committing one built against a placeholder domain risked it accidentally shipping as-is. Regenerate it (from `Backend/`, against a running DB): `uv run python -m scripts.generate_sitemap --site-url https://<real-domain>` — do this once the domain is finalized, and again after any `seed_pokedex` run that adds new species/moves/abilities/items. `public/robots.txt` points at `/sitemap.xml` unconditionally (works whether or not the file happens to exist yet).

## A `<Select>` gotcha worth knowing before adding another one

shadcn/ui's `Select` (built on `@base-ui/react/select`) only shows the *label* for the current value in its trigger if it can resolve that value to a label — and by default, it only learns value→label pairs by having actually rendered a `<Select.Item>` for that value at least once, which doesn't happen until the popup has opened. Result: a `Select` given an initial/pre-filled `value` prop (e.g. restoring a persisted team, or a "no selection" sentinel like `"__none__"`) shows the raw value instead of a real label until the user opens the dropdown once. Fix: pass the `items` prop to `Select` — a plain `Record<string, ReactNode>` (or array) mapping every valid value to its label — which lets `Select.Value` resolve the label immediately, with no popup interaction required. Every `Select` in this codebase should have an `items` prop; see `PokedexBrowser.tsx`'s type filter or any of the `PokemonConfigForm`/`TeamSlotEditor` selects for the pattern.

**The same gotcha bites even with an `items` prop, if the current `value` genuinely isn't one of its keys** — e.g. `TeamSlotEditor`'s move/ability selects, whose `items` map only covers the selected Pokemon's own `learnable_moves`/`abilities`: a just-imported move id is briefly missing while that Pokemon's profile is still loading, and (before a real fix to the movepool's own egg-move gap — see `backend/README.md`'s movepool section) some legitimately learnable moves were missing from `items` entirely. Either way, `Select.Value` falls back to rendering the bare `value` string verbatim — a raw Showdown id like `"voltswitch"`, not a real name. `TeamSlotEditor.tsx`'s `selectItems` helper guards against this generically: it builds the normal `items` map from the resolved options, then — if the current value still isn't a key — adds it in anyway under a `humanizeShowdownId` (`src/lib/utils.ts`) label, so the trigger never shows a raw crushed-together id even in that gap. Reuse `selectItems`/`humanizeShowdownId` for any new `Select` whose `value` can come from a Showdown id that isn't guaranteed to already be in its own `items` map.

## One consistent sprite size for a single-Pokemon focus (`PokemonSprite`), and a shared 404 fallback (`SpriteImg`)

[`src/components/PokemonSprite.tsx`](../../Frontend/src/components/PokemonSprite.tsx) exports two things:

- **`PokemonSprite`** — a wrapper (`<img className="h-24 w-24 object-contain" ...>`, overridable via `className`) that fixes one canonical size — 96px, the size the Pokedex detail header (`PokemonDetail`) already used — for every place the UI focuses on exactly *one* Pokemon: the Pokedex detail header itself, each evolution-chain node and Mega Evolution forme, the Team Builder's per-slot preview, the Damage Calculator's attacker/defender config forms, and the Damage Calculator's result panel. Before this existed, each of those had picked its own ad-hoc size (as small as 40px in the Team Builder), which read as inconsistent/careless once seen side by side.
- **`SpriteImg`** — the lower-level piece `PokemonSprite` is built on, exposed separately for the dense multi-item grids/lists that intentionally stay smaller (`PokemonSummaryGrid`, `SearchBar`'s dropdown, `FeaturedPokemonCard`) so they still get the same 404 handling without inheriting the 96px size.

Both exist because Showdown's `sprites/dex` CDN inconsistently hyphenates forme filenames — our `sprite_url` is built from the hyphen-less species id (e.g. `landorustherian.png`), which 404s for many common formes (Landorus-Therian, Tornadus-Therian, regional formes, Giratina-Origin, ...) even though the hyphenated filename (`landorus-therian.png`) works. `SpriteImg` retries once with a hyphenated variant derived from the display name on `onError`, and if that also fails, renders an initial-letter placeholder instead of a broken-image icon — not exhaustive (a genuine handful of formes, e.g. Urshifu, have no working `dex` sprite at all upstream), but it fixes the vast majority of real OU-relevant cases. If a new page adds a sprite `<img>`, reach for `PokemonSprite` (single-Pokemon focus) or `SpriteImg` (grid/list) rather than a new bespoke `<img>` or picking a new size.

## A `PokemonPicker` gotcha worth knowing too

`PokemonPicker` (`src/components/PokemonPicker.tsx`) uses an *uncontrolled* `<input defaultValue={...}>` (paired with a `<datalist>`) rather than a controlled input, so typing doesn't fight the component over cursor position while a search query is in flight. The tradeoff: an uncontrolled input's `defaultValue` is only read once, at mount — if the `speciesId` prop is later set from *outside* the component (e.g. a team restored from `localStorage` after the picker already mounted), the input won't visually update on its own. Fixed with `key={speciesId}` on the `<input>`, which forces React to remount (and thus re-read `defaultValue`) whenever the external `speciesId` actually changes. If you copy this uncontrolled-input-plus-datalist pattern elsewhere, copy the `key` too.

Only the Damage Calculator's attacker/defender pickers use this component today — the Team Builder's species picker was upgraded to the sprite-forward `SpeciesCombobox` (see "Visual Team Builder + Professor team build" above), which doesn't have this gotcha at all: it's a normal controlled `Combobox` whose `value` is derived straight from `usePokemonProfile(speciesId)`, so an externally-changed `speciesId` (e.g. a team the Professor just applied) re-renders correctly with no `key` trick needed.

## Professor / Conversational Team Doctor (Phase 2 UI)

`/professor` ([`src/pages/coach/CoachPage.tsx`](../../Frontend/src/pages/coach/CoachPage.tsx)) is the frontend for the Phase 2 agent (`app/agent/graph.py`) — branded in the UI as **Professor**. A chat widget: the transcript lives in the client (and optionally the Rotom session store), and each turn sends the prior messages as `history` so follow-ups keep context without a server-side session store.

- **`src/lib/chatApi.ts`'s `streamChatMessage()`** opens one `WS /chat/ws` connection per question, sends `{"message": ..., "team_builder": ..., "team": [...], "history": [...]}`, streams `{"type": "token", ...}` events into the assistant's message bubble as they arrive, and closes the socket on `{"type": "done", ...}` (or `{"type": "error", ...}`) — see `app/routers/chat.py`'s docstring for the exact event shapes this depends on. `MarkdownMessage` renders while streaming too (deferred re-parse + `stabilizeStreamingMarkdown` so half-written `**`/links don't flash raw). Internal `/…` links use React Router, and `/pokedex/{id}` links mount up to six `PokemonShowcaseCard`s via client-side profile/meta fetches.
- **Citations render as `Badge`s under the assistant's bubble**, one per `RetrievedChunk` returned in the `done` event's `citations` array — clicking through to the source isn't wired up yet (citations only carry a `title`/`source_id` today, not a dedicated citation-detail route).
- **A missing-API-key 503 is rendered as a normal (if visually distinct) chat bubble, not a crash** — `onError` sets `isError: true` on the message, which `ChatBubble` styles with `bg-destructive/10`. This is the same "real error, not a hardcoded fallback" principle as everywhere else in this codebase, just surfaced conversationally instead of as a toast.
- **Suggested-question chips** (hardcoded example questions) only show before the first message is sent — once `messages` is non-empty they're replaced by the actual conversation.
- **`ProfessorChat`'s `teamBuilderMode`/`contextTeam`/`onApplyTeam` props** are how `/team-builder` embeds the exact same widget in "can build my team" mode (see the "Visual Team Builder" section above) — `teamBuilderMode` swaps in a different suggestion-chip set and sends `team_builder: true` + the roster's species ids over the socket (see `app/agent/graph.py`'s `TEAM_BUILDER_INSTRUCTIONS`); every other prop combination (homepage's `compact`, `/professor`'s full-page mode) is unaffected.
- **Apply-team flow:** `extractShowdownBlock()` pulls a fenced ` ```showdown ` block out of any assistant reply (the contract the backend prompt asks for when proposing a full team); when `teamBuilderMode` is on, a matching reply gets an "Apply this team" button that calls the existing `importTeam()` → `onApplyTeam(team)`. If the message that triggered the reply clearly asked to build/fill a team (`looksLikeBuildTeamRequest()`, a narrow regex on words like "build"/"fill" + "team") the same flow **also** runs automatically as soon as streaming finishes, no click needed — a false negative there just means the button is still there to click; a false positive would silently overwrite the user's team, so the heuristic stays intentionally narrow.

## Mental-Game Coach (Phase 3 UI) + Web Push

`/professor/check-in` ([`src/pages/coach/MentalCoachPage.tsx`](../../Frontend/src/pages/coach/MentalCoachPage.tsx)) is the check-in surface for Phase 3's session tracking (`app/tools/battle_log.py`) — log a win/loss, see the "two-loss rule" tilt nudge fire, manage Web Push permission, and ask for a grounded post-loss explanation.

- **Anonymous identity, not a real account.** `src/lib/clientId.ts`'s `getClientId()` generates a `crypto.randomUUID()` once per browser and persists it to `localStorage` (`masterball-client-id`) — every `/sessions/*` call is scoped to this id. See `backend/README.md`'s "Mental-Game Coach (Phase 3)" section for why this is deliberately not a real account yet.
- **`src/hooks/usePushSubscription.ts`** owns the whole permission lifecycle as one state machine (`unsupported` / `unconfigured` / `default` / `granted` / `denied`): it fetches `GET /sessions/push/vapid-public-key` on mount, and if the backend has no VAPID keys configured (`public_key: null` — the default in local dev, see `Backend/.env.example`), the UI shows a plain explanatory message instead of a button that would just 503. Subscribing calls the browser's real `Notification.requestPermission()` + `PushManager.subscribe()` (using the VAPID public key as `applicationServerKey`, base64url-decoded into a raw `ArrayBuffer`) and POSTs the resulting subscription to the backend; unsubscribing does the reverse.
- **Tilt nudges render as an in-page banner**, not just the OS-level push notification — `postBattleLog`'s response includes the same `tilt_check` the backend used to decide whether to push, so a user actively looking at the tab sees the nudge immediately even without needing the browser's permission flow to have been granted at all. The two delivery paths (in-page banner vs. Web Push) are independent and don't gate each other.
- **"Explain this loss"** calls `POST /sessions/post-loss-review` with that entry's id and renders the response with the exact same citation-badge treatment as `/professor`'s chat bubbles — it's the same underlying agent graph, just entered through a different prompt (`app/tools/battle_log.py`'s `build_post_loss_prompt`), so the UI reuses the same `ChatResponse` shape (`src/types/chat.ts`) rather than a parallel type.
- **Push delivery itself is handled by a custom service worker**, not the frontend page — see "PWA" below for why `vite-plugin-pwa` had to switch strategies to support this.

## On-device mood model (Phase 7)

The post-loss note field on this same page also runs a real, small ML model **entirely in the browser** — see [`tech-stack.md`](../tech-stack.md#on-deviceedge-ai-optional-stretch--see-roadmapmd)'s "On-device/edge AI" section and [`roadmap.md`](../roadmap.md#phase-7--premium-features-and-stretch-goals)'s Phase 7 item 2 for why this earns a place on the roadmap: on-device/edge inference is a real, distinct, currently-hot AI-hiring category, and this is a concrete, defensible use of it (an instant mood/tilt signal on a note, with zero network round-trip after the model's one-time download) rather than a tacked-on demo.

- **[`src/workers/moodWorker.ts`](../../Frontend/src/workers/moodWorker.ts)** runs `@huggingface/transformers` (Transformers.js) inside a dedicated Web Worker — `Xenova/distilbert-base-uncased-finetuned-sst-2-english`, a small quantized sentiment-classification model, WebGPU-accelerated where available and falling back to WASM otherwise. It's isolated in its own worker (rather than the main thread) specifically because this is a live-typing surface — a UI jank source is exactly what a worker avoids.
- **[`src/hooks/useOnDeviceMood.ts`](../../Frontend/src/hooks/useOnDeviceMood.ts)** debounces the note text (matching `useDebouncedValue`'s pattern elsewhere), lazily constructs the worker only once the note first becomes non-empty (so simply visiting the page never triggers a model download), and exposes a small state machine (`idle` / `loading-model` / `classifying` / `ready` / `error` / `unsupported`) — a stale/superseded classification response (the model can still be mid-request when a newer keystroke's debounce fires) is dropped via a monotonically increasing `requestId`, never allowed to overwrite a newer result.
- **The binary positive/negative model output is bucketed into three labels** (`positive` / `neutral` / `negative`) by confidence — below a threshold, a low-confidence call is shown as neutral rather than overstating a mood the model isn't actually sure about (this model has no native neutral class).
- **The "runs locally... no network round-trip" caption is always shown alongside the badge**, the same "never present a number without its caveat" discipline as `WinProbabilityPanel`'s `model_note` — here making the actual point of the feature (an architecture claim, not an accuracy claim) legible in the UI itself, not just in this doc.
- **Fails silently, never blocking the actual check-in flow**: `unsupported` (no `Worker` support) and `error` states render either nothing or a small inline message — logging a result never depends on this feature having worked.
- **Excluded from the PWA precache manifest** (`vite.config.ts`'s `injectManifest.globPatterns`) — `@huggingface/transformers`' bundled onnxruntime-web WASM binary is a large (~23MB), on-demand asset; precaching it on every install would defeat the "small, opt-in" point of the feature, and Workbox refuses to precache anything over its 2MB default cap anyway.
- **Not unit-tested against the real model** (a real Worker + a real downloaded model has no place in a jsdom test run) — `MentalCoachPage.test.tsx` mocks `useOnDeviceMood` the same way it already mocks `usePushSubscription`, asserting the UI renders correctly for each state the hook can report. Manually verified end to end in a real browser against the real model for both a clearly negative and a clearly positive note.

## PWA

`vite-plugin-pwa` is configured in `vite.config.ts` with `registerType: 'autoUpdate'` and a manifest. `theme_color`/`background_color` now match the dark theme's `--background` (`#0e0b17`) — installed-app splash screens and browser chrome should feel like an extension of the app rather than a mismatched placeholder — but the actual icon set is still a generic placeholder (`favicon.svg`), that's a later polish pass, not a Phase 0 blocker. This is the **only committed mobile-distribution mechanism** for this project — see [`tech-stack.md`](../tech-stack.md#mobile--distribution) for the full reasoning (a native/Capacitor wrapper is an explicit, optional, unscheduled stretch goal, not a planned deliverable).

**`strategies: "injectManifest"`, not the default `generateSW` (since Phase 3).** [`src/sw.ts`](../../Frontend/src/sw.ts) is a real, hand-written service worker source file — `precacheAndRoute(self.__WB_MANIFEST)` reproduces exactly what `generateSW` would have auto-generated, but this file also owns `push` and `notificationclick` listeners, which `generateSW`'s auto-generated output has no hook for. `workbox-precaching`/`workbox-routing` are pinned as explicit `devDependencies` (matching the version `vite-plugin-pwa`'s bundled `workbox-build` already pulls in transitively) since `injectManifest` bundles `src/sw.ts`'s own imports directly, rather than generating them. The `push` handler expects the exact `{title, body}` JSON payload `app/tools/push.py`'s `send_push_notification` sends; `notificationclick` focuses an existing tab if one's open, or opens a new one at `/` otherwise.

## Docker image

`Dockerfile.dev` is a **dev-only** image — it runs Vite's dev server (`npm run dev -- --host 0.0.0.0`) against a bind-mounted source tree for hot reload, via `docker-compose.yml`. There's no production Dockerfile yet (no production build/deploy exists this early — see [`roadmap.md`](../roadmap.md)); when one's needed, it'll be a separate multi-stage build (`npm run build` → serve the static `dist/` output), not a repurposing of this file.

**Note on `npm install` vs `npm ci`:** `Dockerfile.dev` deliberately uses `npm install` instead of the stricter `npm ci`. This project is developed on Windows, and Windows-generated `package-lock.json` files have been observed to omit Linux-only optional native dependencies (specifically `@emnapi/core`/`@emnapi/runtime`, transitive optional deps used by Tailwind/lightningcss's WASM fallback path) — which makes `npm ci` fail inside the Linux-based Docker image even though the lockfile is otherwise perfectly valid. The same reasoning applies to `.github/workflows/ci.yml`'s frontend job. If dependency installs ever start behaving inconsistently between a Windows machine and Docker/CI, this is the first thing to check.

Similarly, `docker-compose.yml` mounts a separate `frontend_node_modules` named volume at `/app/node_modules`, layered over the bind-mounted source — this keeps the container's own Linux-built `node_modules` (with correct native binaries) from being shadowed by a Windows-built one from the host.

## End-to-end tests (Playwright, Phase 7)

[`playwright.config.ts`](../../Frontend/playwright.config.ts) + [`e2e/team-to-coach.spec.ts`](../../Frontend/e2e/team-to-coach.spec.ts) — see [`roadmap.md`](../roadmap.md#phase-7--premium-features-and-stretch-goals)'s item 8. One flow, exercised against the real, running app (real backend, real seeded Postgres, real Neo4j) — nothing here is mocked, unlike the Vitest component tests (`*.test.tsx`) sitting alongside the pages they cover:

1. Paste a real Showdown export on the Team Builder page, import it, and confirm both Pokemon resolve (their profile sprite loads — the species name itself lives in an uncontrolled `<input>`'s `defaultValue`, so the sprite's `alt` text is the reliable signal, not visible text).
2. Click "Analyze team" and confirm the real `analyze_team` output renders (the "Type coverage" table).
3. Navigate to the Professor (`/professor`), ask a suggested question, and confirm a response bubble renders with non-empty content.

**Step 3 deliberately accepts either outcome as a pass:** a real cited answer, *or* the app's own graceful "provider key not configured" error bubble — this dev/CI environment has no real `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` set (a real, recurring per-call cost this project is deliberately careful about elsewhere too — see the promptfoo/LLM-eval cost-discipline notes in [`backend/README.md`](../backend/README.md#eval-loop-phase-4)), so asserting only the happy path would make this suite unrunnable without paying for API calls. Either outcome proves the same thing end to end: the full request pipeline (frontend → `WS /chat/ws` → agent → response) actually works.

**Deliberately NOT wired into `ci.yml`** — same reasoning as Phase 4's promptfoo suite (see its own docs): this needs a full running stack (frontend dev server + backend + a real seeded Postgres + Neo4j), which is a meaningfully different, heavier CI setup than the existing Vitest/pytest jobs already provisioned. Run it locally against `docker compose up` (or `npm run dev` + a locally-running backend):

```bash
cd Frontend
npx playwright install chromium   # one-time browser download
npm run test:e2e
```
