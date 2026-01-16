import { createServerClient } from "@supabase/ssr";
import { cacheLife } from "next/cache";
import type { Tables, Database } from "@/lib/supabase/types";

export type CatalogSummary = Pick<Tables<"catalogs">, "id" | "name" | "slug">;
export type CookieSnapshot = Array<{ name: string; value: string }>;

export async function getOrgCatalogSummaries(
  orgSlug: string,
  cookieSnapshot: CookieSnapshot = [],
): Promise<CatalogSummary[]> {
  "use cache";
  cacheLife("hours");

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieSnapshot;
        },
        setAll() {
        },
      },
    },
  );

  const { data, error } = await supabase
    .from("catalogs")
    .select("id, name, slug, org_id, organizations!inner(slug)")
    .eq("organizations.slug", orgSlug)
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []).map(({ id, name, slug }) => ({ id, name, slug }));
}
