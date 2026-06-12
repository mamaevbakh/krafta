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

import type { ChecklistEntry } from "./activation-checklist";

export async function getChecklistEntries(
  supabase: SupabaseClient<Database>,
  params: {
    orgId: string;
    catalogId: string;
    orgSlug: string;
    catalogSlug: string;
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

  return [
    {
      key: "menu",
      label: "Make the menu yours — edit or add an item",
      done: menuEdited,
      href: itemsHref,
    },
    {
      key: "photo",
      label: "Add a real photo",
      done: (mediaRes.data ?? []).length > 0,
      href: itemsHref,
    },
    // "Review your order modes" was removed: the wizard updates the venue
    // during creation, so its venue.updated_at !== created_at fact was true
    // from birth for every wizard shop — a permanently pre-checked row is
    // noise, not guidance. Its slot is reserved for "Secure your shop"
    // (register without publishing) once that flow exists.
    {
      key: "hours",
      label: "Set your opening hours",
      done:
        Object.keys((venue.business_hours as Record<string, unknown>) ?? {})
          .length > 0,
      href: settingsHref,
    },
    {
      key: "theme",
      label: "Pick your look",
      done: Object.keys(branding).length > 0,
      // The Studio lives at the /builder segment (nav label ≠ route name).
      href: `/dashboard/${params.orgSlug}/${params.catalogSlug}/builder`,
    },
    {
      key: "alerts",
      label: "Get order alerts in Telegram",
      done: Boolean(telegramRes.data?.chat_id && telegramRes.data.is_active),
      href: settingsHref,
    },
    {
      key: "publish",
      label: "Publish your shop",
      done: venue.status === "active",
    },
  ];
}
