"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import { normalizeBehaviorSettings } from "@/lib/catalogs/settings/behavior";

export async function updateCatalogSettings(params: {
  catalogId: string;
  catalogSlug: string;
  name: string;
  description: string;
  tags: string[];
  enableCart?: boolean;
}) {
  const supabase = await createClient();
  const name = params.name.trim();

  if (!name) {
    return { ok: false, error: "Catalog name is required." };
  }

  // Read-modify-write on settings_behavior so we don't clobber other keys
  // future migrations might add.
  const { data: existing, error: readError } = await supabase
    .from("catalogs")
    .select("settings_behavior")
    .eq("id", params.catalogId)
    .maybeSingle();
  if (readError) {
    return { ok: false, error: readError.message };
  }

  const currentBehavior = normalizeBehaviorSettings(
    typeof existing?.settings_behavior === "object" &&
      existing?.settings_behavior !== null
      ? (existing.settings_behavior as Record<string, unknown>)
      : {},
  );

  const nextBehavior = {
    ...currentBehavior,
    ...(params.enableCart !== undefined ? { enableCart: params.enableCart } : {}),
  };

  const { error } = await supabase
    .from("catalogs")
    .update({
      name,
      description: params.description.trim() || null,
      tags: params.tags,
      settings_behavior: nextBehavior,
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
