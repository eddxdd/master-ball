import { expect, test } from "@playwright/test";

/**
 * The flagship end-to-end flow (Docs/roadmap.md's Phase 7 item 8): build a
 * team visually with the sprite pickers -> get a deterministic team
 * analysis -> ask the Professor a follow-up question -> get a response.
 * Runs against the real, running app (real backend, real seeded Postgres)
 * — nothing here is mocked, unlike the Vitest component tests.
 *
 * The chat step deliberately accepts *either* a real cited answer or the
 * app's own graceful "provider key not configured" error bubble as a pass:
 * this dev/CI environment has no real OPENAI_API_KEY/ANTHROPIC_API_KEY set
 * (a real, recurring cost — see Docs/roadmap.md's cost-discipline notes
 * elsewhere), and asserting only the happy path would make this suite
 * unrunnable without paying for API calls. Either outcome proves the same
 * thing end to end: the full request pipeline (frontend -> WS -> agent ->
 * response) actually works, which is this test's real point.
 *
 * Team assembly deliberately goes through the deterministic visual picker
 * (not the Professor's "build me a team" chat action) for the same
 * no-API-key reason — the analysis step needs a real team regardless of
 * whether an LLM is configured.
 */
async function addPokemonBySpecies(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /Add Pokemon/ }).click();
  const speciesInput = page.getByPlaceholder("Search Pokemon...");
  await speciesInput.fill(name);
  await page
    .getByRole("option", { name: new RegExp(name, "i") })
    .first()
    .click();
}

test("build a team -> get analysis -> ask a follow-up in chat -> get a response", async ({
  page,
}) => {
  await page.goto("/team-builder");

  await addPokemonBySpecies(page, "Landorus-Therian");
  // Each slot's sprite only renders once its profile has resolved — the
  // reliable signal the pick actually landed (the name itself sits inside
  // the collapsed tile, not a form control with stable text).
  await expect(page.getByAltText("Landorus-Therian")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Done" }).click();

  await addPokemonBySpecies(page, "Rotom-Wash");
  await expect(page.getByAltText("Rotom-Wash")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Analyze team" }).click();

  // analyze_team's real, deterministic output (app/tools/team_analysis.py) —
  // Rotom-Wash is immune to Ground (Electric/Water), a real type-chart fact
  // that only shows up once the analysis has actually run.
  await expect(page.getByText(/type coverage/i).first()).toBeVisible({ timeout: 15_000 });

  // Dedicated /professor page is retired — ask via the Team Builder embed
  // (same ProfessorChat widget the Rotom launcher uses).
  const question = "Suggest a teammate for my team";
  await page.getByRole("button", { name: question }).click();

  // The user's own message bubble renders instantly; the assistant's reply
  // bubble is the second chat bubble in the message list — either a real
  // grounded answer or the app's own graceful missing-provider-key message.
  // Both are non-empty text in that same bubble shape, unlike a silent
  // hang/crash. Scoped to the message list itself (not `div.rounded-xl`
  // page-wide) since the surrounding Card also uses rounded corners.
  const chatBubbles = page.locator("#team-builder-professor div.overflow-y-auto div.rounded-xl");
  await expect(chatBubbles).toHaveCount(2, { timeout: 30_000 });
  await expect(async () => {
    const assistantText = await chatBubbles.nth(1).textContent();
    expect((assistantText ?? "").trim().length).toBeGreaterThan(0);
    expect(assistantText).not.toBe("Thinking...");
  }).toPass({ timeout: 30_000 });
});
