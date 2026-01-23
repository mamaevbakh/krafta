"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";

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
