// lib/catalogs/layout.tsx

import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicTax,
} from "@/lib/catalogs/types";
import type { PublicVenue } from "@/lib/catalogs/data";
import { normalizeCatalogSettings } from "@/lib/catalogs/settings";
import {
  normalizeLayoutSettings,
  type CatalogLayoutOverride,
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
import { CatalogSearchLazy } from "@/components/catalogs/search/catalog-search-lazy";
import {
  CartDrawer,
  CartProvider,
  CartTrigger,
} from "@/components/catalogs/cart";

type Props = {
  catalog: PublicCatalog;
  categoriesWithItems: PublicCategoryWithItems[];
  venue?: PublicVenue | null;
  taxes?: PublicTax[];
  activeCategorySlug?: string | null;
  activeItemSlug?: string | null;
  baseHref?: string;
  layoutOverride?: CatalogLayoutOverride;
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
  venue = null,
  taxes = [],
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  layoutOverride,
  currencyOverride,
}: Props) {
  const hrefBase = baseHref ?? `/${catalog.slug}`;

  const { layout, currency, behavior } = normalizeCatalogSettings(catalog);
  const resolvedLayout = layoutOverride
    ? normalizeLayoutSettings({
        ...layout,
        ...layoutOverride,
        itemCard: {
          ...layout.itemCard,
          ...(layoutOverride.itemCard ?? {}),
        },
        header: {
          ...layout.header,
          ...(layoutOverride.header ?? {}),
          basicFreeLogo: {
            ...layout.header.basicFreeLogo,
            ...(layoutOverride.header?.basicFreeLogo ?? {}),
          },
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

  const tree = (
    <ItemSheetProvider
      key={`${activeCategorySlugResolved ?? "none"}:${activeItemSlug ?? "none"}`}
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
          headerSettings={resolvedLayout.header}
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
      <CatalogSearchLazy
        catalogId={catalog.id}
        orgId={catalog.org_id ?? null}
        categoriesWithItems={categoriesWithItems}
        currencySettings={resolvedCurrency}
      />
    </ItemSheetProvider>
  );

  // Cart UI is opt-in per catalog via settings_behavior.enableCart, and only
  // renders when we have a venue (always true post-Migration 2, but the null
  // path guards against catalogs created outside the normal flow).
  if (!venue || !behavior.enableCart) return tree;

  // Paused / archived venues: customer can still browse the menu, but no
  // cart UI renders. Surface a banner so the missing Add-to-cart buttons
  // are not mysterious.
  if (venue.status !== "active") {
    return (
      <>
        <NotAcceptingOrdersBanner />
        {tree}
      </>
    );
  }

  // Constrain to the modes our checkout flow understands, preserving the
  // venue's ordering. The DB CHECK constraint on venues already restricts
  // to this set; this filter is a defense-in-depth.
  const allowedModes = ["dine_in", "pickup", "delivery"] as const;
  const venueModes = venue.modes_enabled.filter(
    (mode): mode is (typeof allowedModes)[number] =>
      (allowedModes as readonly string[]).includes(mode),
  );

  return (
    <CartProvider
      orgId={venue.org_id}
      venueId={venue.id}
      catalogPath={hrefBase}
      modes={venueModes}
      taxes={taxes}
    >
      {tree}
      <CartTrigger />
      <CartDrawer currencySettings={resolvedCurrency} />
    </CartProvider>
  );
}

function NotAcceptingOrdersBanner() {
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-muted/80 px-4 py-2 text-center text-xs font-medium text-muted-foreground backdrop-blur">
      Not accepting orders right now
    </div>
  );
}
