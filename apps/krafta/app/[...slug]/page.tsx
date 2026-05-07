// app/[...slug]/page.tsx
import type { JSX } from "react";
import { notFound } from "next/navigation";

import {
  getCatalogBySlug,
  getCatalogStructure,
  getVenueByCatalogId,
} from "@/lib/catalogs/data";
import { CatalogLayout } from "@/lib/catalogs/layout";

type CatalogRouteParams = {
  slug?: string[]; // [...slug] → ['kfc'] or ['kfc','drinks'] or ['kfc','drinks','coke']
};

export default function CatalogPage({
  params,
}: {
  params: Promise<CatalogRouteParams>;
}) {
  return <CatalogPageContent params={params} />;
}

async function CatalogPageContent({
  params,
}: {
  params: Promise<CatalogRouteParams>;
}): Promise<JSX.Element> {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    notFound();
  }

  const [catalogSlug, categoryOrItemSlug, maybeItemSlug] = slug ?? [];

  const activeCategorySlug = slug.length >= 2 ? categoryOrItemSlug : null;
  const activeItemSlug = slug.length >= 3 ? maybeItemSlug : null;

  const catalog = await getCatalogBySlug(catalogSlug);
  if (!catalog) notFound();

  const [categoriesWithItems, venue] = await Promise.all([
    getCatalogStructure(catalog.id),
    getVenueByCatalogId(catalog.id),
  ]);

  return (
    <CatalogLayout
      catalog={catalog}
      categoriesWithItems={categoriesWithItems}
      venue={venue}
      activeCategorySlug={activeCategorySlug}
      activeItemSlug={activeItemSlug}
      baseHref={`/${catalog.slug}`}
    />
  );
}
