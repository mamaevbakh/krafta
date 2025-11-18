import { createClient } from "@/lib/supabase/server";

export async function getDefaultOrgSlug() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("organizations")
    .select("slug")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // If nothing in DB, fall back to a known slug
  return data?.slug ?? "default-org";
}

export async function getDefaultCatalogSlug(orgSlug: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("catalogs")
    .select("slug, org_id, organizations!inner(slug)")
    .eq("organizations.slug", orgSlug)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // If no catalog for org, fall back to a known slug
  return data?.slug ?? "default-catalog";
}
