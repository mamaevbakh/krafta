import type { Tables } from "@/lib/supabase/types";
import {
  type CatalogLayoutSettings,
  defaultLayoutSettings,
  normalizeLayoutSettings,
} from "./layout";
import {
  type CurrencySettings,
  defaultCurrencySettings,
  normalizeCurrencySettings,
} from "./currency";
import {
  type CatalogBehaviorSettings,
  defaultBehaviorSettings,
  normalizeBehaviorSettings,
} from "./behavior";
import {
  type DeliverySettings,
  defaultDeliverySettings,
  normalizeDeliverySettings,
} from "./delivery";

export type CatalogSettingsSource = Pick<
  Tables<"catalogs">,
  "settings_layout" | "settings_currency" | "settings_behavior"
> &
  Partial<Pick<Tables<"catalogs">, "settings_delivery">>;

export type CatalogSettings = {
  layout: CatalogLayoutSettings;
  currency: CurrencySettings;
  behavior: CatalogBehaviorSettings;
  delivery: DeliverySettings;
  // later: branding, i18n
};

export function normalizeCatalogSettings(
  catalog: CatalogSettingsSource,
): CatalogSettings {
  const rawLayout =
    typeof catalog.settings_layout === "object" &&
    catalog.settings_layout !== null
      ? (catalog.settings_layout as Record<string, unknown>)
      : {};
  const rawCurrency =
    typeof catalog.settings_currency === "object" &&
    catalog.settings_currency !== null
      ? (catalog.settings_currency as Record<string, unknown>)
      : {};
  const rawBehavior =
    typeof catalog.settings_behavior === "object" &&
    catalog.settings_behavior !== null
      ? (catalog.settings_behavior as Record<string, unknown>)
      : {};
  const rawDelivery =
    typeof catalog.settings_delivery === "object" &&
    catalog.settings_delivery !== null
      ? (catalog.settings_delivery as Record<string, unknown>)
      : {};

  return {
    layout: normalizeLayoutSettings({
      ...defaultLayoutSettings,
      ...rawLayout,
    }),
    currency: normalizeCurrencySettings({
      ...defaultCurrencySettings,
      ...rawCurrency,
    }),
    behavior: normalizeBehaviorSettings({
      ...defaultBehaviorSettings,
      ...rawBehavior,
    }),
    delivery: normalizeDeliverySettings({
      ...defaultDeliverySettings,
      ...rawDelivery,
    }),
  };
}
