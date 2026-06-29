import "server-only";

import { getCommerceAdminClient } from "./client";

export type CatalogOverview = {
  name: string | null;
  slug: string | null;
  status: string | null;
  currency: { code: string | null; label: string | null };
  orderModes: string[];
  venueStatus: string | null;
  cartEnabled: boolean;
  assistantEnabled: boolean;
  layout: {
    header: string | null;
    card: string | null;
    nav: string | null;
    section: string | null;
    columns: number | null;
  };
  counts: { categories: number; items: number };
  categories: Array<{ name: string; itemCount: number }>;
  sampleItems: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Read-only snapshot of a catalog's current shape, for the Krafta Studio agent.
 *
 * Part of the commerce SDK seed: a single, reusable read facade the agent uses
 * to be genuinely shop-aware (real categories, item counts, currency, modes,
 * and the live layout settings) instead of guessing. Service-role scoped —
 * the caller (the studio-agent route) authorizes org membership BEFORE this
 * runs, and the catalogId is bound there, never taken from the model.
 */
export async function getCatalogOverview(
  catalogId: string,
): Promise<CatalogOverview | null> {
  const supabase = getCommerceAdminClient();
  if (!supabase) return null;

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("name, slug, status, settings_layout, settings_currency, settings_behavior")
    .eq("id", catalogId)
    .maybeSingle();

  if (!catalog) return null;

  const [{ data: venue }, { data: categoriesRows }, { data: itemRows }] =
    await Promise.all([
      supabase
        .from("venues")
        .select("status, modes_enabled")
        .eq("catalog_id", catalogId)
        .maybeSingle(),
      supabase
        .from("catalog_categories")
        .select("id, name")
        .eq("catalog_id", catalogId)
        .eq("is_active", true)
        .order("position", { ascending: true }),
      supabase
        .from("items")
        .select("name, category_id")
        .eq("catalog_id", catalogId)
        .eq("is_active", true),
    ]);

  const layout = asRecord(catalog.settings_layout);
  const layoutItemCard = asRecord(layout.itemCard);
  const currency = asRecord(catalog.settings_currency);
  const behavior = asRecord(catalog.settings_behavior);

  const categories = categoriesRows ?? [];
  const items = itemRows ?? [];

  const itemCountByCategory = new Map<string, number>();
  for (const item of items) {
    const key = item.category_id ?? "";
    itemCountByCategory.set(key, (itemCountByCategory.get(key) ?? 0) + 1);
  }

  return {
    name: catalog.name ?? null,
    slug: catalog.slug ?? null,
    status: catalog.status ?? null,
    currency: {
      code: (currency.defaultCurrency as string) ?? null,
      label: (currency.label as string) ?? null,
    },
    orderModes: Array.isArray(venue?.modes_enabled)
      ? (venue?.modes_enabled as string[])
      : [],
    venueStatus: venue?.status ?? null,
    cartEnabled: behavior.enableCart !== false,
    assistantEnabled: behavior.enableAssistant === true,
    layout: {
      header: (layout.headerVariant as string) ?? null,
      card: (layout.itemCardVariant as string) ?? null,
      nav: (layout.categoryNavVariant as string) ?? null,
      section: (layout.sectionVariant as string) ?? null,
      columns:
        typeof layoutItemCard.columns === "number"
          ? (layoutItemCard.columns as number)
          : null,
    },
    counts: { categories: categories.length, items: items.length },
    categories: categories.map((category) => ({
      name: category.name,
      itemCount: itemCountByCategory.get(category.id) ?? 0,
    })),
    sampleItems: items.slice(0, 12).map((item) => item.name),
  };
}
