import "server-only";

// ADR 0005 §3 — activation-checklist fact gathering, layout edition.
//
// The checklist floats on EVERY dashboard page (it lives in the catalog
// layout), so its facts can't ride the items page's fetch anymore. Instead:
// five parallel, indexed, single-row/limit probes — derived state stays the
// source of truth (D9: the shop can't lie about itself), and the layout's
// time-to-first-byte cost is one extra parallel wave, not a waterfall.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { getDashboardT } from "@/lib/locales/dashboard/server";

import type { ChecklistEntry } from "./activation-checklist";

export async function getChecklistEntries(
  supabase: SupabaseClient<Database>,
  params: {
    orgId: string;
    catalogId: string;
    orgSlug: string;
    catalogSlug: string;
    /** Anon merchants (the wizard's default path) still need to register;
     *  registered merchants have nothing to secure, so the row is omitted. */
    isAnonymous: boolean;
  },
): Promise<ChecklistEntry[]> {
  const [venueRes, catalogRes, itemsRes, mediaRes, telegramRes] =
    await Promise.all([
      supabase
        .from("venues")
        .select("status, business_hours")
        .eq("catalog_id", params.catalogId)
        .maybeSingle(),
      supabase
        .from("catalogs")
        .select("settings_branding")
        .eq("id", params.catalogId)
        .maybeSingle(),
      // "Menu touched" = any item of the merchant's own, or any edited seed.
      // Capped probe: 200 rows of three timestamp columns is ~10 KB and far
      // beyond any onboarding-scale catalog.
      supabase
        .from("items")
        .select("seeded_at, created_at, updated_at")
        .eq("catalog_id", params.catalogId)
        .limit(200),
      supabase
        .from("item_media")
        .select("id, items!inner(catalog_id)")
        .eq("items.catalog_id", params.catalogId)
        .limit(1),
      supabase
        .schema("commerce")
        .from("venue_telegram_settings")
        .select("chat_id, is_active")
        .eq("org_id", params.orgId)
        .maybeSingle(),
    ]);

  const venue = venueRes.data;
  if (!venue) return [];

  const items = itemsRes.data ?? [];
  const menuEdited = items.some(
    (i) => !i.seeded_at || i.updated_at !== i.created_at,
  );
  const branding =
    (catalogRes.data?.settings_branding as Record<string, unknown>) ?? {};
  const settingsHref = `/dashboard/${params.orgSlug}/${params.catalogSlug}/settings`;
  const itemsHref = `/dashboard/${params.orgSlug}/${params.catalogSlug}/items`;
  const t = await getDashboardT();

  return [
    {
      key: "menu",
      label: t("activation.checklist.step.menu"),
      done: menuEdited,
      href: itemsHref,
    },
    {
      key: "photo",
      label: t("activation.checklist.step.photo"),
      done: (mediaRes.data ?? []).length > 0,
      href: itemsHref,
    },
    // "Secure your shop": the anon-session SPOF mitigation. Shown only to
    // anonymous merchants (registered ones have nothing to secure, so no
    // born-done noise). Opens a register-without-publish dialog, not a link.
    ...(params.isAnonymous
      ? [
          {
            key: "secure",
            label: t("activation.checklist.step.secure"),
            done: false,
            action: "secure" as const,
          },
        ]
      : []),
    {
      key: "hours",
      label: t("activation.checklist.step.hours"),
      done:
        Object.keys((venue.business_hours as Record<string, unknown>) ?? {})
          .length > 0,
      href: settingsHref,
    },
    {
      key: "theme",
      label: t("activation.checklist.step.theme"),
      done: Object.keys(branding).length > 0,
      // The Studio lives at the /builder segment (nav label ≠ route name).
      href: `/dashboard/${params.orgSlug}/${params.catalogSlug}/builder`,
    },
    {
      key: "alerts",
      label: t("activation.checklist.step.alerts"),
      done: Boolean(telegramRes.data?.chat_id && telegramRes.data.is_active),
      href: settingsHref,
    },
    {
      key: "publish",
      label: t("activation.checklist.step.publish"),
      done: venue.status === "active",
    },
  ];
}
