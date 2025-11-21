import type { Catalog, CategoryWithItems } from "@/lib/catalogs/types";
import { normalizeCatalogSettings } from "@/lib/catalogs/settings";
import { resolveCatalogLayout } from "@/lib/catalogs/layout-registry";
import { getCatalogLogoUrl, getItemImageUrl } from "@/lib/catalogs/media";

type Props = {
  catalog: Catalog;
  categoriesWithItems: CategoryWithItems[];
  // optional: if we start using routes like /[catalogSlug]/[categorySlug]
  activeCategoryId?: string | null;
  baseHref?: string; // e.g. `/shop-slug` or `/[catalogSlug]`
};

export function CatalogLayout({
  catalog,
  categoriesWithItems,
  activeCategoryId = null,
  baseHref = `/${catalog.slug}`, // adjust to your routing
}: Props) {
  const { layout } = normalizeCatalogSettings(catalog);
  const { Header, Section, ItemCard, CategoryNav } = resolveCatalogLayout(layout);

  const logoUrl = getCatalogLogoUrl(catalog);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 text-foreground">
      <Header catalogName={catalog.name} catalog={catalog} logoUrl={logoUrl} description={catalog.description} />

      {CategoryNav && (
        <CategoryNav
          categories={categoriesWithItems}
          activeCategoryId={activeCategoryId}
          baseHref={baseHref}
        />
      )}

      <section className="space-y-8">
        {categoriesWithItems.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No categories or items in this catalog yet.
          </p>
        )}

        {categoriesWithItems.map((category) => (
          <Section key={category.id} category={category}>
            {category.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No items in this category yet.
              </p>
            ) : (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                {category.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    imageUrl={getItemImageUrl(item)}
                  />
                ))}
              </div>
            )}
          </Section>
        ))}
      </section>
    </main>
  );
}
