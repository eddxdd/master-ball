# Frontend structure & conventions

What's actually in [`Frontend/`](../../Frontend/) and how it's organized. For *why* these tools were chosen, see [`tech-stack.md`](../tech-stack.md); for *how to run it*, see [`setup.md`](../setup.md). This doc is the structural layer — kept in sync with the code as it grows, not a restatement of the planning docs.

## Folder layout

```
Frontend/
  src/
    main.tsx             Entry point — mounts <App/>, wraps it in QueryClientProvider
    App.tsx               Root component (currently just the Phase 0 health-check wiring)
    App.test.tsx
    index.css             Tailwind entry point + shadcn/ui theme tokens
    vite-env.d.ts          Vite/import.meta.env type augmentations (VITE_APP_NAME, VITE_API_BASE_URL)
    config/
      branding.ts          APP_NAME — the one place the display name is read from
    lib/
      api.ts               fetch wrappers (currently just fetchHealth)
      utils.ts              shadcn/ui's cn() helper
    hooks/
      useHealth.ts          TanStack Query hook wrapping fetchHealth
    components/
      ui/                   shadcn/ui components land here (currently: button.tsx)
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

As real features land (Pokédex, Team Builder, etc. — see [`roadmap.md`](../roadmap.md)), expect `src/` to grow into `src/pages/` or `src/features/<feature>/` (components + hooks colocated per feature), plus a `src/store/` for Zustand slices once there's real client state to hold (team-builder editor state is the first candidate). Update this doc when that structure lands for real, rather than guessing it here in advance.

## Conventions

- **`APP_NAME` from `src/config/branding.ts`, never a hardcoded string.** Sourced from `VITE_APP_NAME` with a fallback — this is the frontend half of the naming convention in the root [`README.md`](../README.md#naming--branding). Used for `document.title` and will be used anywhere else the display name shows up in the UI.
- **The `@/` import alias maps to `src/`** (configured in `tsconfig.json`/`tsconfig.app.json` + `vite.config.ts`'s `resolve.alias`), matching shadcn/ui's own convention (`@/components`, `@/lib/utils`, etc. — see `components.json`).
- **Server state via TanStack Query, client/UI state via Zustand.** `useHealth` (`src/hooks/useHealth.ts`) is the first example of the former; Zustand is installed but has no store yet (first real use: the team-builder editor's in-progress team, once that feature exists).
- **shadcn/ui components are vendored into `src/components/ui/`, not imported from a package.** Add new ones with `npx shadcn@latest add <component>` — this copies the component's source into the repo (editable, no black-box dependency), per shadcn's own model.
- **Biome owns both lint and format** (`npm run lint` / `npm run lint:fix` / `npm run format`) — there's no separate ESLint/Prettier config to keep in sync. Vite's own scaffolding tool defaults new projects to a different linter (`oxlint`); that was deliberately swapped out for Biome during Phase 0 scaffolding — see [`tech-stack.md`](../tech-stack.md#frontend) for why.
- **Vitest config lives inside `vite.config.ts`** (the `test` key), not a separate `vitest.config.ts` — one file for both, using the `/// <reference types="vitest/config" />` triple-slash directive for types.

## PWA

`vite-plugin-pwa` is configured in `vite.config.ts` with `registerType: 'autoUpdate'` and a manifest (name/theme color, currently generic placeholders — no real branded icons yet, that's a later polish pass, not a Phase 0 blocker). This is the **only committed mobile-distribution mechanism** for this project — see [`tech-stack.md`](../tech-stack.md#mobile--distribution) for the full reasoning (a native/Capacitor wrapper is an explicit, optional, unscheduled stretch goal, not a planned deliverable).

## Docker image

`Dockerfile.dev` is a **dev-only** image — it runs Vite's dev server (`npm run dev -- --host 0.0.0.0`) against a bind-mounted source tree for hot reload, via `docker-compose.yml`. There's no production Dockerfile yet (no production build/deploy exists this early — see [`roadmap.md`](../roadmap.md)); when one's needed, it'll be a separate multi-stage build (`npm run build` → serve the static `dist/` output), not a repurposing of this file.

**Note on `npm install` vs `npm ci`:** `Dockerfile.dev` deliberately uses `npm install` instead of the stricter `npm ci`. This project is developed on Windows, and Windows-generated `package-lock.json` files have been observed to omit Linux-only optional native dependencies (specifically `@emnapi/core`/`@emnapi/runtime`, transitive optional deps used by Tailwind/lightningcss's WASM fallback path) — which makes `npm ci` fail inside the Linux-based Docker image even though the lockfile is otherwise perfectly valid. The same reasoning applies to `.github/workflows/ci.yml`'s frontend job. If dependency installs ever start behaving inconsistently between a Windows machine and Docker/CI, this is the first thing to check.

Similarly, `docker-compose.yml` mounts a separate `frontend_node_modules` named volume at `/app/node_modules`, layered over the bind-mounted source — this keeps the container's own Linux-built `node_modules` (with correct native binaries) from being shadowed by a Windows-built one from the host.
