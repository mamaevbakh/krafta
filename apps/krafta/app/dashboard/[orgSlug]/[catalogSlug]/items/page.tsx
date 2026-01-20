import { createClient } from "@/lib/supabase/server";
import type { Item } from "@/lib/catalogs/types";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ItemsTable } from "./_components/items-table";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardItemsPage({ params }: PageProps) {
  const { catalogSlug } = await params;

  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, pricing_config, settings_currency")
    .eq("slug", catalogSlug)
    .maybeSingle();

  const currencySettings = normalizeCurrencySettings(
    (catalog?.pricing_config ??
      catalog?.settings_currency ??
      {}) as Record<string, unknown>,
  );

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
        <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">Items</h1>
          </div>
          <Button>
            <Plus className="size-5" />
            Add item
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-5 py-4">
        <ItemsTable items={items} currencySettings={currencySettings} />
      </div>
    </main>
  );
}
