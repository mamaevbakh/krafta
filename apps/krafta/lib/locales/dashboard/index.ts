/**
 * Dashboard i18n — public API barrel.
 *
 * Client components:
 *   import { useT } from "@/lib/locales/dashboard/context";
 *   const t = useT();  t("orders.title")
 *
 * Server components:
 *   import { getDashboardT } from "@/lib/locales/dashboard/server";
 *   const t = await getDashboardT();  t("orders.title")
 *
 * (Those two entry points are imported directly — one is "use client", the
 * other "server-only" — so they're intentionally NOT re-exported here to keep
 * the boundary explicit. This barrel exposes the shared, boundary-free bits.)
 */

export {
  getDashboardMessage,
  getDashboardPlural,
  createTranslator,
  type TranslateFn,
  type DashboardMessageKey,
} from "./messages";

export {
  DASHBOARD_LOCALE_COOKIE,
  DASHBOARD_LOCALES,
  DASHBOARD_LOCALE_NAMES,
  DEFAULT_DASHBOARD_LOCALE,
  normalizeDashboardLocale,
  resolveDashboardLocale,
  type DashboardLocale,
} from "./locale";
