import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 7's Playwright E2E suite (Docs/roadmap.md's Phase 7 item 8) — see
 * Docs/frontend/README.md's "End-to-end tests (Playwright, Phase 7)"
 * section for the full scope note and why this is deliberately NOT wired
 * into ci.yml (same "needs a real running full stack" reasoning as Phase
 * 4's promptfoo suite, per its own docs).
 *
 * Assumes both the frontend dev server (localhost:5173) and the real
 * backend + Postgres (localhost:8000) are already running — via
 * `docker compose up` at the repo root, or `npm run dev` + `uvicorn`
 * locally. This suite exercises the real, running app end to end; it does
 * not mock the network layer the way the Vitest component tests do.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
