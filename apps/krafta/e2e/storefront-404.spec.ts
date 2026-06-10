// Regression — storefront soft-404s. app/[...slug] used to stream behind a
// route-level loading.tsx (plus a root-layout Suspense), so the response
// status was committed as 200 before notFound() could run: unknown shop
// URLs served the not-found UI with HTTP 200, poisoning SEO and any
// status-code monitoring. The page now resolves the catalog in the shell,
// pre-stream — unknown slugs must return a real HTTP 404. Needs only a dev
// server + reachable Supabase (the slug lookup itself).

import { expect, test } from "@playwright/test";

test("unknown storefront slug returns HTTP 404", async ({ page }) => {
  const response = await page.goto("/e2e-no-such-shop-8nv67ws6");
  expect(response, "expected a navigation response").toBeTruthy();
  expect(response!.status()).toBe(404);

  // The customer still sees the branded not-found screen.
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("unknown nested storefront path returns HTTP 404", async ({ page }) => {
  const response = await page.goto("/e2e-no-such-shop-8nv67ws6/category");
  expect(response!.status()).toBe(404);
});

// Control: proves the 404 assertions above aren't vacuous (e.g. the whole
// app erroring into not-found).
test("home page returns HTTP 200", async ({ page }) => {
  const response = await page.goto("/");
  expect(response!.status()).toBe(200);
});
