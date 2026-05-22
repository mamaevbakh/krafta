// app/[...slug]/page.tsx
import type { JSX } from "react";
import { notFound } from "next/navigation";

import {
  getCatalogBySlug,
  getCatalogLocales,
  getCatalogMetaTranslation,
  getCatalogStructure,
  getCatalogTaxes,
  getVenueByCatalogId,
} from "@/lib/catalogs/data";
import { CatalogLayout } from "@/lib/catalogs/layout";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
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

  // KRA-98: catalog meta translation. Only fetch when the customer is
  // viewing a non-default locale — same short-circuit pickLocalizedField
  // would do internally. Skipping the request entirely on the default
  // locale keeps the storefront's cold-render cost flat for the most
  // common case (single-locale catalogs).
  const wantCatalogMetaTranslation =
    !!activeLocale && !!defaultLocale && activeLocale !== defaultLocale;

  const [categoriesWithItems, venue, taxes, catalogMetaTranslations] =
    await Promise.all([
      getCatalogStructure(catalog.id, activeLocale || undefined),
      getVenueByCatalogId(catalog.id),
      getCatalogTaxes(catalog.id),
      wantCatalogMetaTranslation
        ? getCatalogMetaTranslation(catalog.id, activeLocale)
        : Promise.resolve([]),
    ]);

  // Resolve catalog name + description against the active locale. Same
  // pickLocalizedField the per-item renderers use — the resolver returns
  // the canonical value with isFallback=false when activeLocale ===
  // defaultLocale, so the storefront's existing default-locale behaviour
  // is preserved bit-for-bit.
  const resolvedCatalogName = pickLocalizedField({
    translations: catalogMetaTranslations,
    defaults: {
      name: catalog.name,
      description: catalog.description ?? null,
      image_alt: null,
    },
    activeLocale,
    defaultLocale,
    field: "name",
  }).value;
  const resolvedCatalogDescription = pickLocalizedField({
    translations: catalogMetaTranslations,
    defaults: {
      name: catalog.name,
      description: catalog.description ?? null,
      image_alt: null,
    },
    activeLocale,
    defaultLocale,
    field: "description",
  }).value;

  // Hand a thinly-overridden catalog object to the layout so the existing
  // `catalog={catalog}` consumers (logo, tags, slug) keep their reads and
  // the Header just sees the already-localized name + description in the
  // `catalogName=` / `description=` props.
  const localizedCatalog = {
    ...catalog,
    name: resolvedCatalogName || catalog.name,
    description: resolvedCatalogDescription || catalog.description,
  };

  return (
    <CatalogLayout
      catalog={localizedCatalog}
      categoriesWithItems={categoriesWithItems}
      venue={venue}
      taxes={taxes}
      activeCategorySlug={activeCategorySlug}
      activeItemSlug={activeItemSlug}
      baseHref={`/${catalog.slug}`}
      activeLocale={activeLocale}
      defaultLocale={defaultLocale}
      locales={catalogLocales.options}
    />
  );
}
