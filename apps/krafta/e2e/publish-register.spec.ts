// ADR 0005 — the publish path: Publish → slug confirm → demo nudge →
// register (email OTP) → dual-gate flip → live storefront.
//
// The OTP arrives by email; against the LOCAL Supabase stack the message is
// readable from inbucket (http://127.0.0.1:54324). When inbucket isn't
// reachable (no local stack on this machine), the spec skips itself rather
// than pretend — the publish RPC surface is separately covered by pgTAP
// (supabase/tests/publish_guards_test.sql) and SQL probes.

import { expect, test } from "@playwright/test";

const INBUCKET = "http://127.0.0.1:54324";

async function inbucketReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${INBUCKET}/api/v1/mailbox/probe`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function latestOtp(mailbox: string): Promise<string | null> {
  const list = await fetch(
    `${INBUCKET}/api/v1/mailbox/${encodeURIComponent(mailbox)}`,
  ).then((r) => r.json() as Promise<Array<{ id: string }>>);
  const newest = list.at(-1);
  if (!newest) return null;
  const msg = await fetch(
    `${INBUCKET}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${newest.id}`,
  ).then((r) => r.json() as Promise<{ body: { text: string } }>);
  return msg.body.text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

test("publish → register with email OTP → storefront live", async ({ page }) => {
  test.skip(!(await inbucketReachable()), "local Supabase stack (inbucket) not running");

  const mailbox = `merchant-${Date.now()}`;
  const email = `${mailbox}@krafta-e2e.test`;

  // Build a draft shop first (wizard v3, same path the wow spec covers).
  // Restaurant walk: sections, items ×3, look, modes, tables, languages,
  // phone — then the city screen submits.
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Restaurant/ }).click();
  await page.getByLabel("Shop name").fill("Ош Маркази E2E");
  for (let i = 0; i < 10; i++) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Where is your shop?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create my shop" }).click();
  // Reveal: building theater → preview + dashboard CTA.
  await page
    .getByRole("link", { name: "Open my dashboard" })
    .click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/items/, { timeout: 60_000 });

  // Publish: slug step (suggestion is transliterated from the name).
  await page.getByRole("button", { name: "Publish" }).click();
  const slugInput = page.getByRole("textbox", { name: "Shop link" });
  await expect(slugInput).toHaveValue(/osh-markazi/);
  const finalSlug = `osh-e2e-${Date.now().toString(36)}`;
  await slugInput.fill(finalSlug);
  await page.getByRole("button", { name: "Continue" }).click();

  // Demo nudge: untouched seeds are listed; keep them (non-blocking, D19).
  await expect(page.getByText("You still have demo items")).toBeVisible();
  await page.getByRole("button", { name: "Keep them and publish" }).click();

  // Register: email OTP (anon → permanent on the SAME user, D2).
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Enter the code")).toBeVisible();

  const otp = await expect
    .poll(() => latestOtp(mailbox), { timeout: 30_000 })
    .toBeTruthy()
    .then(() => latestOtp(mailbox));
  for (const [i, digit] of [...(otp ?? "")].entries()) {
    await page.locator(`[data-slot=input-otp-slot]`).nth(i).click();
    await page.keyboard.type(digit);
  }

  // Regression guard (slug-rename race): between OTP verify and celebration
  // no server action may revalidate the router. A session-cookie write inside
  // a server action makes Next.js re-render the current (old-slug) route,
  // which races publish_shop's rename — when it loses, /dashboard/[slug] 404s
  // and unmounts the dialog mid-celebration. The OTP verify must stay in the
  // browser (publish-dialog handleVerifyOtp). The listener starts HERE, after
  // "Send code": registerPublishEmail's updateUser legitimately touches the
  // session cookie, and pre-publish revalidations are harmless.
  const revalidatedActions: string[] = [];
  page.on("response", (res) => {
    if (
      res.request().method() === "POST" &&
      res.headers()["x-action-revalidated"]
    ) {
      revalidatedActions.push(res.url());
    }
  });

  await page.getByRole("button", { name: "Verify and publish" }).click();

  // Celebration: dual gate flipped, final slug installed.
  await expect(
    page.getByRole("heading", { name: "Your shop is live" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(finalSlug)).toBeVisible();

  // Regression guard (slug-rename race): the celebration must SURVIVE — a
  // losing race used to swap the route to 404 and kill the dialog a beat
  // after it appeared.
  await page.waitForTimeout(2500);
  await expect(
    page.getByRole("heading", { name: "Your shop is live" }),
  ).toBeVisible();
  expect(revalidatedActions).toEqual([]);

  // The storefront is publicly reachable — fresh context, no cookies.
  const anon = await page.context().browser()!.newContext();
  const customer = await anon.newPage();
  await customer.goto(`/${finalSlug}`);
  await expect(customer.getByText("Плов").first()).toBeVisible();
  await anon.close();
});
