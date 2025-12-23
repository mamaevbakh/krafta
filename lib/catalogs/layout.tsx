// lib/catalogs/layout.tsx

import type { Catalog, CategoryWithItems } from "@/lib/catalogs/types";
import { normalizeCatalogSettings } from "@/lib/catalogs/settings";
import {
  normalizeLayoutSettings,
  type CatalogLayoutSettings,
} from "@/lib/catalogs/settings/layout";
import {
  normalizeCurrencySettings,
  type CurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { resolveCatalogLayout } from "@/lib/catalogs/layout-registry";
import { getCatalogLogoUrl, getItemImageUrl } from "@/lib/catalogs/media";
import {
  ItemSheetProvider,
  ItemSheetTrigger,
} from "@/components/catalogs/items/item-detail-controller";

type Props = {
  catalog: Catalog;
  categoriesWithItems: CategoryWithItems[];
  activeCategorySlug?: string | null;
  activeItemSlug?: string | null;
  baseHref?: string;
  layoutOverride?: Partial<CatalogLayoutSettings>;
  currencyOverride?: CurrencySettings;
};

// map “columns” → Tailwind grid classes (md+)
function getItemGridColsClass(columns: number): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 3:
      return "grid-cols-3";
    case 4:
      return "grid-cols-4";
    case 2:
    default:
      return "grid-cols-2";
  }
}

export function CatalogLayout({
  catalog,
  categoriesWithItems,
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  layoutOverride,
  currencyOverride,
}: Props) {
  const hrefBase = baseHref ?? `/${catalog.slug}`;

  const { layout, currency } = normalizeCatalogSettings(catalog);
  const resolvedLayout = layoutOverride
    ? normalizeLayoutSettings({
        ...layout,
        ...layoutOverride,
        itemCard: {
          ...layout.itemCard,
          ...(layoutOverride.itemCard ?? {}),
        },
      })
    : layout;
  const resolvedCurrency = currencyOverride
    ? normalizeCurrencySettings({
        ...currency,
        ...currencyOverride,
      })
    : currency;
  const { Header, Section, ItemCard, CategoryNav } =
    resolveCatalogLayout(resolvedLayout);

  const logoUrl = getCatalogLogoUrl(catalog);

  // ✅ from normalized layout.itemCard
  const itemCardColumns = resolvedLayout.itemCard.columns;
  const itemImageAspectRatio = resolvedLayout.itemCard.aspectRatio;
  const itemGridColsClass = getItemGridColsClass(itemCardColumns);

  const normalizedActiveSlug =
    activeCategorySlug && activeCategorySlug.length > 0
      ? activeCategorySlug
      : null;

  const activeCategory = normalizedActiveSlug
    ? categoriesWithItems.find((c) => c.slug === normalizedActiveSlug)
    : null;

  const activeCategoryId = activeCategory?.id ?? null;
  const activeCategorySlugResolved = activeCategory?.slug ?? null;

  return (
    <ItemSheetProvider
      categoriesWithItems={categoriesWithItems}
      activeCategorySlug={activeCategorySlugResolved}
      activeItemSlug={activeItemSlug}
      baseHref={hrefBase}
      // 👇 this prop name is important
      itemAspectRatio={itemImageAspectRatio}
      itemDetailVariant={resolvedLayout.itemDetailVariant}
      currencySettings={resolvedCurrency}
    >
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 text-foreground">
        <Header
          catalogName={catalog.name}
          catalog={catalog}
          logoUrl={logoUrl}
          description={catalog.description}
          tags={catalog.tags}
        />

        {CategoryNav && (
          <CategoryNav
            categories={categoriesWithItems}
            activeCategoryId={activeCategoryId}
            activeCategorySlug={activeCategorySlugResolved}
            baseHref={hrefBase}
          />
        )}

        <section className="space-y-8">
          {categoriesWithItems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No categories or items in this catalog yet.
            </p>
          )}

          {categoriesWithItems.map((category) => {
            const categorySlug = category.slug ?? String(category.id);

            return (
              <Section key={category.id} category={category}>
                {category.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No items in this category yet.
                  </p>
                ) : (
                  <div className={`grid gap-2 ${itemGridColsClass}`}>
                    {category.items.map((item) => {
                      const itemSlug = item.slug ?? String(item.id);

                      return (
                        <ItemSheetTrigger
                          key={item.id}
                          itemSlug={itemSlug}
                          categorySlug={categorySlug}
                        >
                          <ItemCard
                            imageAspectRatio={itemImageAspectRatio}
                            item={item}
                            imageUrl={getItemImageUrl(item)}
                            currencySettings={resolvedCurrency}
                          />
                        </ItemSheetTrigger>
                      );
                    })}
                  </div>
                )}
              </Section>
            );
          })}
        </section>
      </main>
    </ItemSheetProvider>
  );
}
