// app/[...slug]/page.tsx
import { Suspense, type JSX } from "react";
import { notFound } from "next/navigation";

import {
  getCatalogBySlug,
  getCatalogLocales,
  getCatalogMetaTranslation,
  getCatalogStructure,
  getCatalogTaxes,
  getVenueByCatalogId,
} from "@/lib/catalogs/data";
import type { PublicCatalog } from "@/lib/catalogs/types";
import { CatalogLayout } from "@/lib/catalogs/layout";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { resolveStorefrontLocale } from "@/lib/catalogs/storefront-locale";
import { CatalogSkeleton } from "./catalog-skeleton";

type CatalogRouteParams = {
  slug?: string[]; // [...slug] → ['kfc'] or ['kfc','drinks'] or ['kfc','drinks','coke']
};

type CatalogSearchParams = Record<string, string | string[] | undefined>;

// Presence of generateStaticParams is what lets the page await params (and
// the cached catalog lookup) OUTSIDE a Suspense boundary under
// cacheComponents: listed paths prerender at build, everything else renders
// on demand per path (fallback-blocking), where notFound() can still
// produce a real HTTP 404. Without it, `next build` fails the route with
// "Uncached data was accessed outside of <Suspense>" — and Cache Components
// requires at least one returned path for that validation, so an empty
// list also fails the build. The demo shop is the one slug that's part of
// the product rather than merchant data (the homepage CTA links to it), so
// it doubles as the build-time sample.
export function generateStaticParams(): Array<{ slug: string[] }> {
  return [{ slug: ["vintage-shop"] }];
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<CatalogRouteParams>;
  searchParams: Promise<CatalogSearchParams>;
}): Promise<JSX.Element> {
  // The catalog must resolve BEFORE the Suspense boundary below: the HTTP
  // status is committed the moment the shell flushes, so a notFound() that
  // fires inside the boundary renders the not-found UI but still returns
  // 200 (a soft-404 — bad for SEO and status-code monitoring). Awaiting
  // the lookup here keeps the 404 decision pre-stream; getCatalogBySlug is
  // "use cache", so the shell pays at most one cached lookup before the
  // skeleton flushes. For the same reason this route must NOT have a
  // loading.tsx — it would wrap this whole component in the route-level
  // boundary and commit the 200 before the lookup runs.
  //
  // searchParams stays un-awaited until CatalogPageContent: request data
  // reads must happen under a Suspense boundary with cacheComponents on.
  const { slug } = await params;
  if (!slug || slug.length === 0) {
    notFound();
  }

  const [catalogSlug, categoryOrItemSlug, maybeItemSlug] = slug;

  const catalog = await getCatalogBySlug(catalogSlug);
  if (!catalog) notFound();

  const activeCategorySlug = slug.length >= 2 ? categoryOrItemSlug : null;
  const activeItemSlug = slug.length >= 3 ? maybeItemSlug : null;

  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <CatalogPageContent
        catalog={catalog}
        activeCategorySlug={activeCategorySlug ?? null}
        activeItemSlug={activeItemSlug ?? null}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function CatalogPageContent({
  catalog,
  activeCategorySlug,
  activeItemSlug,
  searchParams,
}: {
  catalog: PublicCatalog;
  activeCategorySlug: string | null;
  activeItemSlug: string | null;
  searchParams: Promise<CatalogSearchParams>;
}): Promise<JSX.Element> {
  const resolvedSearchParams = await searchParams;

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
