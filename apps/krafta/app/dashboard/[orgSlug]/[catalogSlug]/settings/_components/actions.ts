"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import {
  type DeliverySettings,
  normalizeDeliverySettings,
} from "@/lib/catalogs/settings/delivery";
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
    return { ok: false, error: "Catalog name is required." };
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
  const name = params.name.trim();
  if (!name) {
    return { ok: false as const, error: "Venue name is required." };
  }

  if (!/^[A-Z]{3}$/.test(params.currency)) {
    return { ok: false as const, error: "Currency must be a 3-letter code." };
  }

  if (params.modesEnabled.length === 0) {
    return {
      ok: false as const,
      error: "At least one order mode must be enabled.",
    };
  }
  for (const mode of params.modesEnabled) {
    if (!ALLOWED_MODES.includes(mode)) {
      return { ok: false as const, error: `Unknown order mode: ${mode}.` };
    }
  }

  for (const day of DAY_KEYS) {
    const windows = params.businessHours[day];
    if (!Array.isArray(windows) || windows.length === 0) continue;
    const w = windows[0];
    if (!w || !TIME_PATTERN.test(w.open) || !TIME_PATTERN.test(w.close)) {
      return { ok: false as const, error: `Invalid hours for ${day}.` };
    }
    if (w.open >= w.close) {
      return {
        ok: false as const,
        error: `${day}: closing time must be after opening time.`,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("venues")
    .update({
      name,
      status: params.status,
      modes_enabled: params.modesEnabled,
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
    return {
      ok: false as const,
      error: "Set your cafe location on the map before enabling delivery.",
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
