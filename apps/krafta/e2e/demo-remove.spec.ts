// ADR 0005 D19 — the destructive leg of the publish-time demo nudge:
// "Remove demo items" deletes every untouched seeded item in one bulk
// DELETE and advances the flow. Runs without email (stops at the register
// step), so it needs no local stack.

import { expect, test } from "@playwright/test";

test("publish nudge removes untouched demo items", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Cafe/ }).click();
  await page.getByLabel("Shop name").fill("Demo Removal QA");
  await page.getByRole("button", { name: "Create my shop" }).click();
  await page.waitForURL(/\/items/, { timeout: 60_000 });

  // Seeded cafe canvas: 5 items across 2 categories.
  await expect(page.getByText("Капучино")).toBeVisible();

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
