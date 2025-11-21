import type { Tables } from "@/lib/supabase/types";
import {
  type CatalogLayoutSettings,
  defaultLayoutSettings,
  normalizeLayoutSettings,
} from "./layout";

export type Catalog = Tables<"catalogs">;

export type CatalogSettings = {
  layout: CatalogLayoutSettings;
  // later: currency, branding, i18n, behavior
};

export function normalizeCatalogSettings(catalog: Catalog): CatalogSettings {
  const rawLayout = (catalog as any).settings_layout ?? {};

  return {
    layout: normalizeLayoutSettings({
      ...defaultLayoutSettings,
      ...(rawLayout as Record<string, unknown>),
    }),
  };
}
