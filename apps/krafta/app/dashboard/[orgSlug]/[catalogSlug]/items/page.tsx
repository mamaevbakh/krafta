import { createClient } from "@/lib/supabase/server";
import type { Item } from "@/lib/catalogs/types";
import { columns } from "./_components/columns";
import { DataTable } from "./_components/data-table";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardItemsPage({ params }: PageProps) {
  const { catalogSlug } = await params;

  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id")
    .eq("slug", catalogSlug)
    .maybeSingle();

  let items: Item[] = [];
  if (catalog?.id) {
    const { data } = await supabase
      .from("items")
      .select(
        "id, catalog_id, category_id, name, slug, position, price_cents, description, image_path, image_alt, metadata, is_active, created_at",
      )
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true });

    items = (data ?? []) as Item[];
  }

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto max-w-[1248px] px-6 h-[120px] flex-1 justify-start items-stretch">
          <h1 className="text-[32px] font-semibold tracking-tight h-full flex items-center">
            Items
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <DataTable columns={columns} data={items} />
      </div>
    </main>
  );
}
