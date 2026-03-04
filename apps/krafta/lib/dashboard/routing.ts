import { createClient } from "@/lib/supabase/server";

export async function getDefaultOrgSlug(): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("organizations")
    .select("slug")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.slug ?? null;
}

export async function getDefaultCatalogSlug(orgSlug: string): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("catalogs")
    .select("slug, org_id, organizations!inner(slug)")
    .eq("organizations.slug", orgSlug)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.slug ?? null;
}
