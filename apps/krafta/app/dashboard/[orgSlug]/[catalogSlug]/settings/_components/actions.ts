"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import { orgCan } from "@/lib/billing/gate";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import {
  type DeliverySettings,
  normalizeDeliverySettings,
} from "@/lib/catalogs/settings/delivery";
import { normalizeBehaviorSettings } from "@/lib/catalogs/settings/behavior";
import type { Json } from "@/lib/supabase/types";

export async function updateCatalogSettings(params: {
  catalogId: string;
  catalogSlug: string;
  name: string;
  description: string;
  tags: string[];
}) {
  const supabase = await createClient();
  const name = params.name.trim();

  if (!name) {
    const t = await getDashboardT();
    return { ok: false, error: t("settings.catalog.name_required") };
  }

  const { error } = await supabase
    .from("catalogs")
    .update({
      name,
      description: params.description.trim() || null,
      tags: params.tags,
    })
    .eq("id", params.catalogId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true };
}

const ALLOWED_MODES = ["dine_in", "pickup", "delivery"] as const;
type VenueMode = (typeof ALLOWED_MODES)[number];

type HoursWindow = { open: string; close: string };
type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
type BusinessHours = Record<DayKey, HoursWindow[]>;

const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateVenueSettings(params: {
  catalogId: string;
  catalogSlug: string;
  name: string;
  status: "active" | "paused";
  modesEnabled: VenueMode[];
  businessHours: BusinessHours;
  currency: string;
  timezone: string;
  languageCode: string;
  address: {
    country: string;
    city: string;
    street: string;
    postal: string;
    notes: string;
  };
}) {
  const t = await getDashboardT();
  const name = params.name.trim();
  if (!name) {
    return { ok: false as const, error: t("settings.venue.name_required") };
  }

  if (!/^[A-Z]{3}$/.test(params.currency)) {
    return { ok: false as const, error: t("settings.venue.currency_invalid") };
  }

  if (params.modesEnabled.length === 0) {
    return {
      ok: false as const,
      error: t("settings.venue.modes_required"),
    };
  }
  for (const mode of params.modesEnabled) {
    if (!ALLOWED_MODES.includes(mode)) {
      return {
        ok: false as const,
        error: t("settings.venue.mode_unknown", { mode }),
      };
    }
  }

  for (const day of DAY_KEYS) {
    const windows = params.businessHours[day];
    if (!Array.isArray(windows) || windows.length === 0) continue;
    const w = windows[0];
    if (!w || !TIME_PATTERN.test(w.open) || !TIME_PATTERN.test(w.close)) {
      return {
        ok: false as const,
        error: t("settings.venue.hours_invalid", {
          day: t(`settings.venue.day.${day}`),
        }),
      };
    }
    if (w.open >= w.close) {
      return {
        ok: false as const,
        error: t("settings.venue.hours_order_error", {
          day: t(`settings.venue.day.${day}`),
        }),
      };
    }
  }

  const supabase = await createClient();

  // Dine-in is a Business-tier feature. Strip it from the saved modes when the
  // org isn't entitled — never block the whole save, just enforce the gate.
  let modesEnabled = params.modesEnabled;
  if (modesEnabled.includes("dine_in")) {
    const { data: catalogRow } = await supabase
      .from("catalogs")
      .select("org_id")
      .eq("id", params.catalogId)
      .maybeSingle();
    if (catalogRow?.org_id && !(await orgCan(catalogRow.org_id, "dine_in"))) {
      modesEnabled = modesEnabled.filter((mode) => mode !== "dine_in");
      if (modesEnabled.length === 0) {
        return {
          ok: false as const,
          error: t("settings.venue.dine_in_gated"),
        };
      }
    }
  }

  const { error } = await supabase
    .from("venues")
    .update({
      name,
      status: params.status,
      modes_enabled: modesEnabled,
      business_hours: params.businessHours,
      currency: params.currency,
      timezone: params.timezone,
      language_code: params.languageCode,
      address: params.address,
    })
    .eq("catalog_id", params.catalogId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true as const };
}

export async function updateDeliverySettings(params: {
  catalogId: string;
  catalogSlug: string;
  enabled: boolean;
  originLat: number | null;
  originLng: number | null;
  radiusM: number;
  feeCents: number;
  minOrderCents: number;
}) {
  // Normalize on the server too — the same guard the storefront trusts. A stale
  // `enabled: true` with no origin collapses to `false` here, so the zone can
  // never silently reject every address.
  const settings: DeliverySettings = normalizeDeliverySettings({
    enabled: params.enabled,
    originLat: params.originLat,
    originLng: params.originLng,
    radiusM: params.radiusM,
    feeCents: params.feeCents,
    minOrderCents: params.minOrderCents,
  });

  if (
    params.enabled &&
    (settings.originLat == null || settings.originLng == null)
  ) {
    const t = await getDashboardT();
    return {
      ok: false as const,
      error: t("settings.delivery.origin_required"),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogs")
    .update({ settings_delivery: settings as unknown as Json })
    .eq("id", params.catalogId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true as const, settings };
}

/**
 * Toggle the storefront AI shopping assistant. Merges into the existing
 * `settings_behavior` JSON so the cart flag (and any future behavior flags) are
 * preserved — read-modify-write rather than overwrite.
 */
export async function updateAssistantSettings(params: {
  catalogId: string;
  catalogSlug: string;
  enabled: boolean;
}) {
  const supabase = await createClient();

  const { data: row, error: readError } = await supabase
    .from("catalogs")
    .select("settings_behavior")
    .eq("id", params.catalogId)
    .maybeSingle();

  if (readError) {
    return { ok: false as const, error: readError.message };
  }

  const behavior = normalizeBehaviorSettings(
    (row?.settings_behavior ?? {}) as Record<string, unknown>,
  );
  const next = { ...behavior, enableAssistant: params.enabled };

  const { error } = await supabase
    .from("catalogs")
    .update({ settings_behavior: next as unknown as Json })
    .eq("id", params.catalogId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true as const, enabled: params.enabled };
}
