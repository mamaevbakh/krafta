"use server";

import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { CatalogBehaviorSettings } from "@/lib/catalogs/settings/behavior";

export async function saveCatalogLayout(params: {
  catalogId: string;
  catalogSlug: string;
  settingsLayout: CatalogLayoutSettings;
  settingsCurrency: CurrencySettings;
  settingsBehavior?: CatalogBehaviorSettings;
}) {
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    settings_layout: params.settingsLayout,
    settings_currency: params.settingsCurrency,
  };
  if (params.settingsBehavior) {
    update.settings_behavior = params.settingsBehavior;
  }

  const { error } = await supabase
    .from("catalogs")
    .update(update)
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

// Record where a coded shop was published (the Studio `publish_shop` tool deploys
// it and returns the URLs; the panel calls this so the dashboard remembers the
// live URL across sessions). Owner/admin-gated by the record_studio_publish RPC.
export async function recordShopPublish(params: {
  catalogId: string;
  publishedUrl: string;
  deploymentUrl?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  // record_studio_publish (migration 20260629160000) isn't in generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types until regen
  const { error } = await (supabase.rpc as any)("record_studio_publish", {
    p_catalog_id: params.catalogId,
    p_published_url: params.publishedUrl,
    p_deployment_url: params.deploymentUrl ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
