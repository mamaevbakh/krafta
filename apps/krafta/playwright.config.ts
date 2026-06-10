// ADR 0005 test plan (eng review D12) — Playwright harness.
//
// Two funnel specs live in e2e/:
//   onboarding-wow-path  — CTA → wizard → seeded Studio. Doubles as the
//                          MANDATORY regression test for the CTA semantics
//                          change (create-now → wizard-first). Needs only a
//                          dev server + a reachable Supabase (anon auth).
//   publish-register     — Publish → email OTP → live storefront. The OTP
//                          leg reads the code from the local stack's
//                          inbucket; the spec self-skips when inbucket is
//                          not reachable (e.g. no Docker on the machine).
//
// Run: pnpm exec playwright test   (starts next dev itself if needed)

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // The funnel mutates per-browser-context state (anon session cookies), so
  // each spec gets a fresh context by default — exactly what we want.
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Pixel 7 = Chromium-based mobile profile: one browser download covers
    // both projects (the Tashkent primary viewport is mid-range Android
    // anyway, per DESIGN.md).
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm exec next dev",
    port: PORT,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
