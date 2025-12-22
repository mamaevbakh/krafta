import type { JSX } from "react";
import { notFound } from "next/navigation";

import { getCatalogBySlug, getCatalogStructure } from "@/lib/catalogs/data";
import { CatalogLayout } from "@/lib/catalogs/layout";
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import {
  categoryNavVariants,
  headerVariants,
  itemDetailVariants,
  itemCardVariants,
  sectionVariants,
} from "@/lib/catalogs/layout-registry";

type CatalogRouteParams = {
  slug?: string[];
};

export default function PreviewCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<CatalogRouteParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PreviewCatalogContent
      params={params}
      searchParams={searchParams}
    />
  );
}

async function PreviewCatalogContent({
  params,
  searchParams,
}: {
  params: Promise<CatalogRouteParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const categoriesWithItems = await getCatalogStructure(catalog.id);
  const layoutOverride = getPreviewLayoutOverride(
    resolvedSearchParams,
  );

  return (
    <CatalogLayout
      catalog={catalog}
      categoriesWithItems={categoriesWithItems}
      activeCategorySlug={activeCategorySlug}
      activeItemSlug={activeItemSlug}
      baseHref={`/preview/${catalog.slug}`}
      layoutOverride={layoutOverride}
    />
  );
}

function getPreviewLayoutOverride(
  searchParams: Record<string, string | string[] | undefined>,
): Partial<CatalogLayoutSettings> | undefined {
  if (searchParams.preview !== "1") return undefined;

  const header =
    typeof searchParams.header === "string"
      ? searchParams.header
      : undefined;
  const section =
    typeof searchParams.section === "string"
      ? searchParams.section
      : undefined;
  const card =
    typeof searchParams.card === "string"
      ? searchParams.card
      : undefined;
  const nav =
    typeof searchParams.nav === "string"
      ? searchParams.nav
      : undefined;
  const detail =
    typeof searchParams.detail === "string"
      ? searchParams.detail
      : undefined;

  const override: Partial<CatalogLayoutSettings> = {};

  if (
    header &&
    headerVariants.includes(
      header as CatalogLayoutSettings["headerVariant"],
    )
  ) {
    override.headerVariant =
      header as CatalogLayoutSettings["headerVariant"];
  }

  if (
    section &&
    sectionVariants.includes(
      section as CatalogLayoutSettings["sectionVariant"],
    )
  ) {
    override.sectionVariant =
      section as CatalogLayoutSettings["sectionVariant"];
  }

  if (
    card &&
    itemCardVariants.includes(
      card as CatalogLayoutSettings["itemCardVariant"],
    )
  ) {
    override.itemCardVariant =
      card as CatalogLayoutSettings["itemCardVariant"];
  }

  if (
    nav &&
    categoryNavVariants.includes(
      nav as CatalogLayoutSettings["categoryNavVariant"],
    )
  ) {
    override.categoryNavVariant =
      nav as CatalogLayoutSettings["categoryNavVariant"];
  }

  if (
    detail &&
    itemDetailVariants.includes(
      detail as CatalogLayoutSettings["itemDetailVariant"],
    )
  ) {
    override.itemDetailVariant =
      detail as CatalogLayoutSettings["itemDetailVariant"];
  }

  return Object.keys(override).length > 0 ? override : undefined;
}
