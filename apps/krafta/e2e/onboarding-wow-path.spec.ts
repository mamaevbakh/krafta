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

  // ④⑤ items — one screen per checked section (wizard v3), suggested items
  // pre-checked with editable prices.
  await expect(page.getByRole("heading", { name: "Кофе" })).toBeVisible();
  await expect(page.locator('input[value="Капучино"]')).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Выпечка" })).toBeVisible();
  await expect(page.locator('input[value="Круассан"]')).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑥ look — tappable presets with live mini-previews; Classic pre-selected.
  await expect(
    page.getByRole("heading", { name: "Pick your look" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Showcase/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑦ modes — cafe defaults (pickup + dine-in), vertical-aware option list.
  await expect(
    page.getByRole("heading", { name: "How do customers order?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑦ tables — its own screen, present only because dine-in is on.
  await expect(
    page.getByRole("heading", { name: "How many tables?" }),
  ).toBeVisible();
  await expect(page.getByText("Tables at your venue")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑧ languages — ru default, uz/en pre-checked.
  await expect(
    page.getByRole("heading", { name: "Menu languages" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ⑨ phone — skippable on its own screen.
  await expect(
    page.getByRole("heading", { name: "How can customers reach you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  // ⑪ city — tap-chip screen, skippable; skipping still creates the shop.
  await expect(
    page.getByRole("heading", { name: "Where is your shop?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  // Building theater plays while the RPC runs, then the reveal: the
  // merchant's own storefront in a phone frame + the dashboard CTA.
  await expect(page.getByRole("heading", { name: /is ready/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("link", { name: "Open my dashboard" }).click();

  // Lands in the Studio with the cafe starter catalog rendered. Scope to
  // the Library row buttons: the reveal's phone-frame preview also says
  // "Капучино" while the route transition streams, so a bare text match
  // is ambiguous.
  await expect(page).toHaveURL(/\/dashboard\/[a-z0-9-]+\/[a-z0-9-]+\/items/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("button", {
      name: "Капучино — click to edit, drag to reorder",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", {
      name: "Круассан — click to edit, drag to reorder",
      exact: true,
    }),
  ).toBeVisible();

  // The draft banner gates going live (ADR 0005 §1).
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // The activation checklist is present and non-blocking (§3). First-visit
  // default: expanded on desktop, a compact pill on mobile (the panel would
  // cover the freshly seeded menu) — expand it before asserting.
  const checklistPill = page.getByRole("button", {
    name: "Open setup checklist",
  });
  if (await checklistPill.isVisible()) {
    await checklistPill.click();
  }
  await expect(page.getByText("Get ready to open")).toBeVisible();

  // REGRESSION: the Studio lives at the /builder segment (nav label ≠ route
  // name) and must not 404. The checklist's "Pick your look" row is born-done
  // since the wizard's Look screen writes settings_branding, so it no longer
  // renders a link — assert the route directly.
  const slugs = page.url().match(/\/dashboard\/([a-z0-9-]+)\/([a-z0-9-]+)/);
  await page.goto(`/dashboard/${slugs![1]}/${slugs![2]}/builder`);
  await expect(
    page.getByRole("heading", { name: "Studio", exact: true }),
  ).toBeVisible();

  // Resume rule (D5): re-entering the wizard skips straight to the Studio.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard\/[a-z0-9-]+\/[a-z0-9-]+\/items/);

  // Idempotency (D5): the CTA never stamps a second shop for this session.
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "View Dashboard" }),
  ).toBeVisible();
});
