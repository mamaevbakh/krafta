// app/[...slug]/page.tsx
import type { JSX } from "react";
import { notFound } from "next/navigation";

import {
  getCatalogBySlug,
  getCatalogLocales,
  getCatalogStructure,
  getCatalogTaxes,
  getVenueByCatalogId,
} from "@/lib/catalogs/data";
import { CatalogLayout } from "@/lib/catalogs/layout";
import { resolveStorefrontLocale } from "@/lib/catalogs/storefront-locale";

type CatalogRouteParams = {
  slug?: string[]; // [...slug] → ['kfc'] or ['kfc','drinks'] or ['kfc','drinks','coke']
};

type CatalogSearchParams = Record<string, string | string[] | undefined>;

export default function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<CatalogRouteParams>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPageContent params={params} searchParams={searchParams} />;
}

async function CatalogPageContent({
  params,
  searchParams,
}: {
  params: Promise<CatalogRouteParams>;
  searchParams: Promise<CatalogSearchParams>;
}): Promise<JSX.Element> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  if (!slug || slug.length === 0) {
    notFound();
  }

  const [catalogSlug, categoryOrItemSlug, maybeItemSlug] = slug ?? [];

  const activeCategorySlug = slug.length >= 2 ? categoryOrItemSlug : null;
  const activeItemSlug = slug.length >= 3 ? maybeItemSlug : null;

  const catalog = await getCatalogBySlug(catalogSlug);
  if (!catalog) notFound();

  // Resolve the customer locale BEFORE fetching the catalog structure so
  // the data layer can target the active-locale translation rows in the
  // same round of parallel fetches. ?lang= is the only signal v1 ships;
  // future locale routing (subpath, cookie) plugs into the same resolver.
  const catalogLocales = await getCatalogLocales(catalog.id);
  const activeLocale =
    resolveStorefrontLocale({
      requested: resolvedSearchParams.lang,
      enabled: catalogLocales.enabled,
      default: catalogLocales.default,
    }) ?? "";
  const defaultLocale = catalogLocales.default ?? "";

  const [categoriesWithItems, venue, taxes] = await Promise.all([
    getCatalogStructure(catalog.id, activeLocale || undefined),
    getVenueByCatalogId(catalog.id),
    getCatalogTaxes(catalog.id),
  ]);

  return (
    <CatalogLayout
      catalog={catalog}
      categoriesWithItems={categoriesWithItems}
      venue={venue}
      taxes={taxes}
      activeCategorySlug={activeCategorySlug}
      activeItemSlug={activeItemSlug}
      baseHref={`/${catalog.slug}`}
      activeLocale={activeLocale}
      defaultLocale={defaultLocale}
    />
  );
}
