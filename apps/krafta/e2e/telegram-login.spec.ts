// KRA-46 / ADR 0006 — the Telegram merchant login bridge, end to end.
//
// Telegram's widget iframe can't be automated, but it is the ONLY fake part
// here: the spec signs a payload with the same bot token the dev server
// verifies against (read from .env.local) and calls the page's stable
// `window.onTelegramAuth` hook directly. Everything downstream is real —
// server action, HMAC verification, GoTrue attach/provision, cookie session,
// publish_shop.
//
// Self-skips when TELEGRAM_BOT_TOKEN isn't configured, same posture as the
// inbucket-dependent publish spec.

import { createHash, createHmac, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

function envFromDotLocal(name: string): string | null {
  try {
    const raw = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    const line = raw
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : null;
  } catch {
    return null;
  }
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? envFromDotLocal("TELEGRAM_BOT_TOKEN");

/** Sign exactly the way Telegram does (legacy widget spec). */
function signedPayload(botToken: string, fields: Record<string, string | number>) {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return { ...fields, hash };
}

function freshTelegramUser(botToken: string, name: string) {
  // Unique per run so re-runs never collide with a previously attached id.
  const id = Date.now() * 100 + randomInt(100);
  return signedPayload(botToken, {
    id,
    first_name: name,
    username: `e2e_${id}`,
    auth_date: Math.floor(Date.now() / 1000),
  });
}

/** Drive the wizard-v2 fast path (7 steps, suggestions pre-checked) to a
 *  seeded draft Studio — same flow the wow-path spec covers in detail. */
async function buildDraftShop(page: Page, name: string) {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Cafe/ }).click();
  await page.getByLabel("Shop name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click(); // → sections
  await expect(
    page.getByRole("heading", { name: "Your menu sections" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // → items
  await page.getByRole("button", { name: "Continue" }).click(); // → modes
  await page.getByRole("button", { name: "Continue" }).click(); // → languages
  await page.getByRole("button", { name: "Continue" }).click(); // → contacts
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/items/, { timeout: 60_000 });
}

test("publish → register with Telegram → storefront live (uid preserved)", async ({
  page,
}) => {
  test.skip(!BOT_TOKEN, "TELEGRAM_BOT_TOKEN not configured");

  await buildDraftShop(page, "Telegram E2E Кафе");

  // Publish: slug step.
  await page.getByRole("button", { name: "Publish" }).first().click();
  const slugInput = page.getByRole("textbox", { name: "Shop link" });
  // Preflight makes several hosted-DB round trips; generous under suite load.
  await expect(slugInput).toBeVisible({ timeout: 60_000 });
  const slug = `tg-e2e-${Date.now().toString(36)}`;
  await slugInput.fill(slug);
  await page.getByRole("button", { name: "Continue" }).click();

  // Demo nudge (seeded items untouched): keep them.
  await page.getByRole("button", { name: "Keep them and publish" }).click();

  // Register step: the widget mounts the stable onTelegramAuth hook; drive
  // it with a payload signed by the same token the server verifies.
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => typeof window.onTelegramAuth === "function"),
    )
    .toBe(true);
  await page.evaluate(
    (payload) => window.onTelegramAuth!(payload),
    freshTelegramUser(BOT_TOKEN!, "Bobur"),
  );

  // The attach flips is_anonymous on the SAME user; publish_shop passes and
  // the celebration renders the live link.
  await expect(
    page.getByRole("heading", { name: "Your shop is live" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`/${slug}`).first()).toBeVisible();

  // The storefront is publicly reachable (dual gate flipped).
  const storefront = await page.context().newPage();
  await storefront.goto(`/${slug}`);
  await expect(storefront.getByText("Капучино").first()).toBeVisible({
    timeout: 30_000,
  });
});

test("fresh Telegram sign-in at /login provisions a user → wizard", async ({
  page,
}) => {
  test.skip(!BOT_TOKEN, "TELEGRAM_BOT_TOKEN not configured");

  await page.goto("/login");
  await expect
    .poll(async () =>
      page.evaluate(() => typeof window.onTelegramAuth === "function"),
    )
    .toBe(true);
  await page.evaluate(
    (payload) => window.onTelegramAuth!(payload),
    freshTelegramUser(BOT_TOKEN!, "Aziza"),
  );

  // Provisioned real (non-anon) user with no shop → the wizard, not a 404.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: "What are you opening?" }),
  ).toBeVisible();
});
