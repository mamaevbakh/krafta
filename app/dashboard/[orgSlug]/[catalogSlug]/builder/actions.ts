"use server";

import { revalidateCatalogById } from "@/lib/catalogs/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

export async function saveCatalogLayout(params: {
  catalogId: string;
  settingsLayout: CatalogLayoutSettings;
  settingsCurrency: CurrencySettings;
}) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("catalogs")
    .update({
      settings_layout: params.settingsLayout,
      settings_currency: params.settingsCurrency,
    })
    .eq("id", params.catalogId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateCatalogById(params.catalogId);

  return { ok: true };
}
