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

export type Catalog = Tables<"catalogs">;

export type CatalogSettings = {
  layout: CatalogLayoutSettings;
  currency: CurrencySettings;
  // later: branding, i18n, behavior
};

export function normalizeCatalogSettings(catalog: Catalog): CatalogSettings {
  const rawLayout = (catalog as any).settings_layout ?? {};
  const rawCurrency = (catalog as any).settings_currency ?? {};

  return {
    layout: normalizeLayoutSettings({
      ...defaultLayoutSettings,
      ...(rawLayout as Record<string, unknown>),
    }),
    currency: normalizeCurrencySettings({
      ...defaultCurrencySettings,
      ...(rawCurrency as Record<string, unknown>),
    }),
  };
}
