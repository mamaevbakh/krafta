// ADR 0005 — the wow path: CTA → vertical → name → seeded Studio.
//
// REGRESSION (iron rule, eng review): the homepage "Create your shop" CTA
// changed from create-shop-immediately to wizard-first. This spec proves the
// CTA still ends in an owned, populated shop. If this fails, every new
// merchant is blocked at the front door.

import { expect, test } from "@playwright/test";

test("create your shop → wizard → seeded Studio", async ({ page }) => {
  await page.goto("/");

  // Fresh visitor: the CTA routes to the wizard, no signup wall.
  await page.getByRole("link", { name: "Create your shop" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(
    page.getByRole("heading", { name: "What are you opening?" }),
  ).toBeVisible();

  // ① vertical — tapping advances immediately.
  await page.getByRole("button", { name: /Cafe/ }).click();
  await expect(
    page.getByRole("heading", { name: "Name your shop" }),
  ).toBeVisible();

  // ② name — Cyrillic on purpose: the market's real input.
  await page.getByLabel("Shop name").fill("Чойхона Тест");
  await page.getByRole("button", { name: "Create my shop" }).click();

  // Lands in the Studio with the cafe starter catalog rendered.
  await expect(page).toHaveURL(/\/dashboard\/[a-z0-9-]+\/[a-z0-9-]+\/items/, {
    timeout: 60_000,
  });
  await expect(page.getByText("Капучино")).toBeVisible();
  await expect(page.getByText("Круассан")).toBeVisible();

  // The draft banner gates going live (ADR 0005 §1).
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // The activation checklist is present and non-blocking (§3).
  await expect(page.getByText("Get ready to open")).toBeVisible();

  // Resume rule (D5): re-entering the wizard skips straight to the Studio.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard\/[a-z0-9-]+\/[a-z0-9-]+\/items/);

  // Idempotency (D5): the CTA never stamps a second shop for this session.
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "View Dashboard" }),
  ).toBeVisible();
});
