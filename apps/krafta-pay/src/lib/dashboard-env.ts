import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

/**
 * Which environment the merchant is working in RIGHT NOW.
 *
 * This used to be `process.env.PAY_ENV` at every call site, which made test
 * mode unusable from the dashboard: PAY_ENV is `live` on production, so a
 * merchant who connected test credentials was told they had no provider at all
 * and could not create a plan, a payment link, or a subscription. Every other
 * layer had already been made environment-aware — the API key carries it, the
 * checkout session stores it, the charge resolves it — and the dashboard was
 * the one place still reading a deploy-wide constant.
 *
 * It is a per-merchant, per-device preference now, exactly like the locale:
 * a cookie the sidebar toggle writes. PAY_ENV survives only as the default, so
 * nothing changes for a merchant who never touches the switch.
 *
 * Deliberately NOT stored on the org: two people on the same account should be
 * able to look at live and test at the same time without fighting each other.
 */

export type DashboardEnvironment = "test" | "live";

export const DASHBOARD_ENV_COOKIE = "krafta_pay_env";

export function normalizeEnvironment(
  value: string | null | undefined,
): DashboardEnvironment | null {
  if (value === "test") return "test";
  if (value === "live") return "live";
  return null;
}

/** Deployment default, used until the merchant chooses. */
export function defaultDashboardEnvironment(): DashboardEnvironment {
  return process.env.PAY_ENV === "test" ? "test" : "live";
}

export const getDashboardEnvironment = cache(async (): Promise<DashboardEnvironment> => {
  const store = await cookies();
  return (
    normalizeEnvironment(store.get(DASHBOARD_ENV_COOKIE)?.value) ??
    defaultDashboardEnvironment()
  );
});
