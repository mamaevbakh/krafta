// ADR 0005 D19 — the destructive leg of the publish-time demo nudge:
// "Remove demo items" deletes every untouched seeded item in one bulk
// DELETE and advances the flow. Runs without email (stops at the register
// step), so it needs no local stack.

import { expect, test } from "@playwright/test";

test("publish nudge removes untouched demo items", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Cafe/ }).click();
  await page.getByLabel("Shop name").fill("Demo Removal QA");
  // Fast path: one tap per screen, suggestions kept untouched (= demo items).
  // Cafe walk: logo, sections, items (one screen, all sections), modes,
  // tables, languages, alerts, phone — then the city screen submits.
  for (let i = 0; i < 9; i++) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Where is your shop?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  // Reveal: building theater → preview + dashboard CTA.
  await page
    .getByRole("link", { name: "Open my dashboard" })
    .click({ timeout: 60_000 });
  await page.waitForURL(/\/items/, { timeout: 60_000 });

  // Seeded cafe canvas: 5 items across 2 categories. Scope to the Library
  // row button — the reveal's preview also says "Капучино" while the
  // route transition streams.
  await expect(
    page.getByRole("button", {
      name: "Капучино — click to edit, drag to reorder",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("textbox", { name: "Shop link" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You still have demo items")).toBeVisible();
  await page.getByRole("button", { name: "Remove demo items" }).click();

  // Removal advances to register (still anon) without publishing.
  await expect(page.getByText("Create your account")).toBeVisible();

  // Close the dialog: the canvas no longer shows seeded items and the
  // shop remains an unpublished draft.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("Капучино")).toHaveCount(0);
  await expect(page.getByText("Draft")).toBeVisible();
});
