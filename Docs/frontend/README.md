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
    vite-env.d.ts          Vite/import.meta.env type augmentations (VITE_APP_NAME, VITE_API_BASE_URL)
    config/
      branding.ts          APP_NAME — the one place the display name is read from
    layout/
      AppLayout.tsx         Nav header + <Outlet/> — the shared shell every route renders inside
    pages/
      HomePage.tsx           "/" — the Phase 0 health-check wiring now lives here
      pokedex/               "/pokedex", "/pokedex/:speciesId"
      calculator/             "/calculator"
      team-builder/           "/team-builder"
    store/
      teamStore.ts            Zustand store for the Team Builder, persisted to localStorage
    types/                   Plain TS types mirroring the backend's Pydantic schemas,
                             one file per feature area (pokemon.ts, calculator.ts, team.ts)
    lib/
      api.ts               apiFetch() helper (shared fetch wrapper) + fetchHealth
      pokedexApi.ts, calculatorApi.ts, teamApi.ts   Typed fetchers per feature area
      pokemonTypes.ts       The 18 type names, shared across pages
      typeColors.ts         Type -> hex color map, used by TypeBadge
      natures.ts             The 25 natures — static game data, duplicated client-side
                             on purpose rather than round-tripped just for a dropdown
      utils.ts              shadcn/ui's cn() helper
    hooks/
      useHealth.ts, usePokedex.ts   TanStack Query hooks, one file per feature area
    components/
      ui/                   shadcn/ui components land here
      TypeBadge.tsx, StatBars.tsx, TypeMatchupChart.tsx, MovepoolTable.tsx,
      PokemonPicker.tsx, StatSpreadInput.tsx   Shared building blocks used across pages
    test/
      setup.ts               Vitest setup (jest-dom matchers)
  public/
    favicon.svg
  index.html
  vite.config.ts            Vite + Tailwind + PWA + Vitest config, all in one place
  biome.json
  components.json            shadcn/ui config (aliases, style, base color)
  package.json
  Dockerfile.dev              Dev-only image (see "Docker image" below)
  .env.example
```

## Conventions

- **`APP_NAME` from `src/config/branding.ts`, never a hardcoded string.** Sourced from `VITE_APP_NAME` with a fallback — this is the frontend half of the naming convention in the root [`README.md`](../README.md#naming--branding). Used for `document.title` and will be used anywhere else the display name shows up in the UI.
- **The `@/` import alias maps to `src/`** (configured in `tsconfig.json`/`tsconfig.app.json` + `vite.config.ts`'s `resolve.alias`), matching shadcn/ui's own convention (`@/components`, `@/lib/utils`, etc. — see `components.json`).
- **Routing via React Router, one `pages/<feature>/` folder per route area.** `App.tsx` only defines the route table (`<Routes>`/`<Route>`); every route renders inside `AppLayout` (nav + `<Outlet/>`). A page component owns its own data-fetching (via a `hooks/use<Feature>.ts` hook) — it isn't handed data as props from `App.tsx`.
- **Server state via TanStack Query, client/UI state via Zustand.** Every backend call goes through a `hooks/use<Feature>.ts` wrapper around a `lib/<feature>Api.ts` fetcher — never a bare `fetch()` in a component. Zustand is reserved for state that has no server counterpart at all (the Team Builder's in-progress team) — see "Team Builder state" below.
- **shadcn/ui components are vendored into `src/components/ui/`, not imported from a package.** Add new ones with `npx shadcn@latest add <component>` — this copies the component's source into the repo (editable, no black-box dependency), per shadcn's own model. Run this from `Frontend/`, not the repo root — the CLI reads `package.json` from the current directory and will otherwise offer to scaffold a brand-new project.
- **Biome owns both lint and format** (`npm run lint` / `npm run lint:fix` / `npm run format`) — there's no separate ESLint/Prettier config to keep in sync. Vite's own scaffolding tool defaults new projects to a different linter (`oxlint`); that was deliberately swapped out for Biome during Phase 0 scaffolding — see [`tech-stack.md`](../tech-stack.md#frontend) for why.
- **Vitest config lives inside `vite.config.ts`** (the `test` key), not a separate `vitest.config.ts` — one file for both, using the `/// <reference types="vitest/config" />` triple-slash directive for types.

## Team Builder state (Zustand + localStorage)

`src/store/teamStore.ts` holds the in-progress team entirely client-side, persisted via Zustand's `persist` middleware to `localStorage` (key: `dextrainer-team-builder`) — **not** a server-side `teams` table. This isn't a shortcut: `analyze_team`'s REST contract takes a full team payload directly, not a `team_id` (see [`Docs/roadmap.md`](../roadmap.md)'s Phase 1 scope note), so there's nothing on the server to persist to yet. Real account-backed team storage arrives in Phase 3, once session logging actually needs a user identity.

## A `<Select>` gotcha worth knowing before adding another one

shadcn/ui's `Select` (built on `@base-ui/react/select`) only shows the *label* for the current value in its trigger if it can resolve that value to a label — and by default, it only learns value→label pairs by having actually rendered a `<Select.Item>` for that value at least once, which doesn't happen until the popup has opened. Result: a `Select` given an initial/pre-filled `value` prop (e.g. restoring a persisted team, or a "no selection" sentinel like `"__none__"`) shows the raw value instead of a real label until the user opens the dropdown once. Fix: pass the `items` prop to `Select` — a plain `Record<string, ReactNode>` (or array) mapping every valid value to its label — which lets `Select.Value` resolve the label immediately, with no popup interaction required. Every `Select` in this codebase should have an `items` prop; see `PokedexBrowser.tsx`'s type filter or any of the `PokemonConfigForm`/`TeamSlotEditor` selects for the pattern.

## A `PokemonPicker` gotcha worth knowing too

`PokemonPicker` (`src/components/PokemonPicker.tsx`) uses an *uncontrolled* `<input defaultValue={...}>` (paired with a `<datalist>`) rather than a controlled input, so typing doesn't fight the component over cursor position while a search query is in flight. The tradeoff: an uncontrolled input's `defaultValue` is only read once, at mount — if the `speciesId` prop is later set from *outside* the component (e.g. a team restored from `localStorage` after the picker already mounted), the input won't visually update on its own. Fixed with `key={speciesId}` on the `<input>`, which forces React to remount (and thus re-read `defaultValue`) whenever the external `speciesId` actually changes. If you copy this uncontrolled-input-plus-datalist pattern elsewhere, copy the `key` too.

## PWA

`vite-plugin-pwa` is configured in `vite.config.ts` with `registerType: 'autoUpdate'` and a manifest (name/theme color, currently generic placeholders — no real branded icons yet, that's a later polish pass, not a Phase 0 blocker). This is the **only committed mobile-distribution mechanism** for this project — see [`tech-stack.md`](../tech-stack.md#mobile--distribution) for the full reasoning (a native/Capacitor wrapper is an explicit, optional, unscheduled stretch goal, not a planned deliverable).

## Docker image

`Dockerfile.dev` is a **dev-only** image — it runs Vite's dev server (`npm run dev -- --host 0.0.0.0`) against a bind-mounted source tree for hot reload, via `docker-compose.yml`. There's no production Dockerfile yet (no production build/deploy exists this early — see [`roadmap.md`](../roadmap.md)); when one's needed, it'll be a separate multi-stage build (`npm run build` → serve the static `dist/` output), not a repurposing of this file.

**Note on `npm install` vs `npm ci`:** `Dockerfile.dev` deliberately uses `npm install` instead of the stricter `npm ci`. This project is developed on Windows, and Windows-generated `package-lock.json` files have been observed to omit Linux-only optional native dependencies (specifically `@emnapi/core`/`@emnapi/runtime`, transitive optional deps used by Tailwind/lightningcss's WASM fallback path) — which makes `npm ci` fail inside the Linux-based Docker image even though the lockfile is otherwise perfectly valid. The same reasoning applies to `.github/workflows/ci.yml`'s frontend job. If dependency installs ever start behaving inconsistently between a Windows machine and Docker/CI, this is the first thing to check.

Similarly, `docker-compose.yml` mounts a separate `frontend_node_modules` named volume at `/app/node_modules`, layered over the bind-mounted source — this keeps the container's own Linux-built `node_modules` (with correct native binaries) from being shadowed by a Windows-built one from the host.
