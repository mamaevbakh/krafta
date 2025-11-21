import type { Tables } from "@/lib/supabase/types";
import {
  type CatalogLayoutSettings,
  defaultLayoutSettings,
} from "./layout";

export type Catalog = Tables<"catalogs">;

export type CatalogSettings = {
  layout: CatalogLayoutSettings;
  // later: currency, branding, i18n, behavior
};

export function normalizeCatalogSettings(catalog: Catalog): CatalogSettings {
  const rawLayout = (catalog as any).settings_layout ?? {};

  return {
    layout: {
      ...defaultLayoutSettings,
      ...rawLayout,
    },
  };
}