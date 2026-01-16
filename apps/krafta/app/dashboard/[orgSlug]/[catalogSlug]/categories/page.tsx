import { createClient } from "@/lib/supabase/server";
import { DataTable } from "./_components/data-table";
import { columns } from "./_components/columns";
import type { CatalogCategory } from "@/lib/catalogs/types";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardCategoriesPage({ params }: PageProps) {
  const { catalogSlug } = await params;

  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id")
    .eq("slug", catalogSlug)
    .maybeSingle();

  let categories: CatalogCategory[] = [];
  if (catalog?.id) {
    const { data } = await supabase
      .from("catalog_categories")
      .select("id, catalog_id, name, slug, position, is_active, created_at")
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true });

    categories = (data ?? []) as CatalogCategory[];
  }

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto max-w-[1248px] px-6 h-[120px] flex-1 justify-start items-stretch">
          <h1 className="text-[32px] font-semibold tracking-tight h-full flex items-center">
            Categories
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <DataTable columns={columns} data={categories} />
      </div>
    </main>
  );
}
