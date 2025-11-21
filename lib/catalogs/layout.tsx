// lib/catalogs/layout.tsx

import type { Catalog, CategoryWithItems } from "@/lib/catalogs/types";
import { normalizeCatalogSettings } from "@/lib/catalogs/settings";
import { resolveCatalogLayout } from "@/lib/catalogs/layout-registry";
import { getCatalogLogoUrl, getItemImageUrl } from "@/lib/catalogs/media";
import {
  ItemSheetProvider,
  ItemSheetTrigger,
} from "@/components/catalogs/items/item-sheet";

type Props = {
  catalog: Catalog;
  categoriesWithItems: CategoryWithItems[];
  /**
   * Optional slug for the "focused" / active category.
   * Comes from the URL: /[catalogSlug]/[categorySlug]
   */
  activeCategorySlug?: string | null;
  /**
   * Optional slug for the active item within a category.
   * Comes from the URL: /[catalogSlug]/[categorySlug]/[itemSlug]
   */
  activeItemSlug?: string | null;
  /**
   * Optional base href for links in category nav.
   * Defaults to `/${catalog.slug}` → e.g. `/my-catalog`
   */
  baseHref?: string;
};

export function CatalogLayout({
  catalog,
  categoriesWithItems,
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref, // we’ll default it below so we can refer to catalog
}: Props) {
  const hrefBase = baseHref ?? `/${catalog.slug}`;

  // 1) Resolve all layout pieces (header / section / card / category nav)
  const { layout } = normalizeCatalogSettings(catalog);
  const { Header, Section, ItemCard, CategoryNav } = resolveCatalogLayout(
    layout,
  );

  // 2) Logo URL (storage helper)
  const logoUrl = getCatalogLogoUrl(catalog);

  // 3) Figure out which category (if any) is active from the slug
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
    >
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 text-foreground">
        {/* Header */}
        <Header
          catalogName={catalog.name}
          catalog={catalog}
          logoUrl={logoUrl}
          description={catalog.description}
        />

        {/* Optional Category Navigation (tabs / pills / whatever the variant resolves to) */}
        {CategoryNav && (
          <CategoryNav
            categories={categoriesWithItems}
            activeCategoryId={activeCategoryId}
            activeCategorySlug={activeCategorySlugResolved}
            baseHref={hrefBase}
          />
        )}

        {/* Categories & items */}
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
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {category.items.map((item) => {
                      const itemSlug = item.slug ?? String(item.id);

                      return (
                        <ItemSheetTrigger
                          key={item.id}
                          itemSlug={itemSlug}
                          categorySlug={categorySlug}
                        >
                          <ItemCard
                            item={item}
                            imageUrl={getItemImageUrl(item)}
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
