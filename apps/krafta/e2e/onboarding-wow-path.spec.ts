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

  // ① vertical — tapping advances (and loads the suggestions).
  await page.getByRole("button", { name: /Cafe/ }).click();
  await expect(
    page.getByRole("heading", { name: "Name your shop" }),
  ).toBeVisible();

  // ② name — Cyrillic on purpose: the market's real input.
  await page.getByLabel("Shop name").fill("Чойхона Тест");
  await page.getByRole("button", { name: "Continue" }).click();

  // ③ sections — vertical suggestions arrive pre-checked (fast path: 1 tap).
  await expect(
    page.getByRole("heading", { name: "Your menu sections" }),
  ).toBeVisible();
  await expect(page.getByText("Кофе")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ④ items — suggested items with editable prices, pre-checked.
  await expect(
    page.getByRole("heading", { name: "Your first items" }),
  ).toBeVisible();
  await expect(page.locator('input[value="Капучино"]')).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑤ modes — cafe defaults (pickup + dine-in) with the table-count stepper.
  await expect(
    page.getByRole("heading", { name: "How do customers order?" }),
  ).toBeVisible();
  await expect(page.getByText("Tables at your venue")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑥ languages — ru default, uz/en pre-checked.
  await expect(
    page.getByRole("heading", { name: "Menu languages" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑦ contacts — skippable; skipping still creates the shop.
  await expect(
    page.getByRole("heading", { name: "How can customers reach you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

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
