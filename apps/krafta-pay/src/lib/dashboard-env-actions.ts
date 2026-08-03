"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DASHBOARD_ENV_COOKIE, normalizeEnvironment } from "./dashboard-env";

/**
 * Persist the merchant's test/live choice.
 *
 * Revalidates the whole dashboard layout: switching environments changes what
 * every page shows — which providers are connected, which subscriptions exist,
 * which metrics are real — so a partial refresh would leave one pane arguing
 * with another about what the merchant is looking at.
 */
export async function setDashboardEnvironmentAction(value: string) {
  const environment = normalizeEnvironment(value);
  if (!environment) return;

  const store = await cookies();
  store.set(DASHBOARD_ENV_COOKIE, environment, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/dashboard", "layout");
}
