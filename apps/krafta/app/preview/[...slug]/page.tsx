import type { JSX } from "react";
import { notFound } from "next/navigation";

import {
  getCatalogBySlug,
  getCatalogLocales,
  getCatalogStructure,
} from "@/lib/catalogs/data";
import { CatalogLayout } from "@/lib/catalogs/layout";
import { resolveStorefrontLocale } from "@/lib/catalogs/storefront-locale";
import type {
  CatalogLayoutOverride,
  CatalogLayoutSettings,
} from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
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

  // Same locale plumbing as the customer route — preview honors ?lang= so
  // the merchant can sanity-check a translation before pointing customers
  // at it.
  const catalogLocales = await getCatalogLocales(catalog.id);
  const activeLocale =
    resolveStorefrontLocale({
      requested: resolvedSearchParams.lang,
      enabled: catalogLocales.enabled,
      default: catalogLocales.default,
    }) ?? "";
  const defaultLocale = catalogLocales.default ?? "";

  const categoriesWithItems = await getCatalogStructure(
    catalog.id,
    activeLocale || undefined,
  );
  const layoutOverride = getPreviewLayoutOverride(
    resolvedSearchParams,
  );
  const currencyOverride = getPreviewCurrencyOverride(
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
      currencyOverride={currencyOverride}
      activeLocale={activeLocale}
      defaultLocale={defaultLocale}
    />
  );
}

function getPreviewLayoutOverride(
  searchParams: Record<string, string | string[] | undefined>,
): CatalogLayoutOverride | undefined {
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
  const columns =
    typeof searchParams.cols === "string"
      ? Number(searchParams.cols)
      : undefined;
  const ratio =
    typeof searchParams.ratio === "string"
      ? Number(searchParams.ratio)
      : undefined;

  const override: CatalogLayoutOverride = {};

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

  const hasValidColumns =
    Number.isFinite(columns) &&
    columns !== undefined &&
    columns >= 1 &&
    columns <= 4;
  const hasValidRatio =
    Number.isFinite(ratio) && ratio !== undefined && ratio > 0;

  if (hasValidColumns || hasValidRatio) {
    override.itemCard = {
      columns: hasValidColumns ? columns : 2,
      aspectRatio: hasValidRatio ? ratio : 4 / 3,
    };
  }

  const showLogo =
    searchParams.hflShowLogo === "1"
      ? true
      : searchParams.hflShowLogo === "0"
        ? false
        : undefined;
  const showTitle =
    searchParams.hflShowTitle === "1"
      ? true
      : searchParams.hflShowTitle === "0"
        ? false
        : undefined;
  const showDescription =
    searchParams.hflShowDescription === "1"
      ? true
      : searchParams.hflShowDescription === "0"
        ? false
        : undefined;
  const showTags =
    searchParams.hflShowTags === "1"
      ? true
      : searchParams.hflShowTags === "0"
        ? false
        : undefined;
  const logoFullWidth =
    searchParams.hflLogoFull === "1"
      ? true
      : searchParams.hflLogoFull === "0"
        ? false
        : undefined;
  const headerRatio =
    typeof searchParams.hflRatio === "string"
      ? Number(searchParams.hflRatio)
      : undefined;
  const headerCorner =
    typeof searchParams.hflCorner === "string"
      ? Number(searchParams.hflCorner)
      : undefined;
  const backgroundColorLight =
    typeof searchParams.hflBgLight === "string"
      ? searchParams.hflBgLight
      : undefined;
  const backgroundColorDark =
    typeof searchParams.hflBgDark === "string"
      ? searchParams.hflBgDark
      : undefined;
  const bannerLightPath =
    typeof searchParams.hflBannerLight === "string"
      ? searchParams.hflBannerLight
      : undefined;
  const bannerDarkPath =
    typeof searchParams.hflBannerDark === "string"
      ? searchParams.hflBannerDark
      : undefined;

  const hasFreeLogoOverride = [
    showLogo,
    showTitle,
    showDescription,
    showTags,
    logoFullWidth,
    headerRatio,
    headerCorner,
    backgroundColorLight,
    backgroundColorDark,
    bannerLightPath,
    bannerDarkPath,
  ].some((value) => value !== undefined);

  if (hasFreeLogoOverride) {
    override.header = {
      basicFreeLogo: {
        ...(showLogo !== undefined ? { showLogo } : {}),
        ...(showTitle !== undefined ? { showTitle } : {}),
        ...(showDescription !== undefined ? { showDescription } : {}),
        ...(showTags !== undefined ? { showTags } : {}),
        ...(logoFullWidth !== undefined ? { logoFullWidth } : {}),
        ...(headerRatio && headerRatio > 0
          ? { logoAspectRatio: headerRatio }
          : {}),
        ...(headerCorner !== undefined && Number.isFinite(headerCorner)
          ? { logoCornerRadius: Math.max(0, headerCorner) }
          : {}),
        ...(backgroundColorLight !== undefined
          ? { backgroundColorLight }
          : {}),
        ...(backgroundColorDark !== undefined
          ? { backgroundColorDark }
          : {}),
        ...(bannerLightPath !== undefined ? { bannerLightPath } : {}),
        ...(bannerDarkPath !== undefined ? { bannerDarkPath } : {}),
      },
    };
  }

  return Object.keys(override).length > 0 ? override : undefined;
}

function getPreviewCurrencyOverride(
  searchParams: Record<string, string | string[] | undefined>,
): CurrencySettings | undefined {
  if (searchParams.preview !== "1") return undefined;

  const hasOverride = [
    "cur",
    "curLabel",
    "curThousand",
    "curDecimal",
    "curDecimals",
    "curPos",
  ].some((key) => typeof searchParams[key] === "string");

  if (!hasOverride) return undefined;

  const defaultCurrency =
    typeof searchParams.cur === "string" ? searchParams.cur : undefined;
  const label =
    typeof searchParams.curLabel === "string"
      ? searchParams.curLabel
      : undefined;
  const thousandSeparator =
    searchParams.curThousand === "," ||
    searchParams.curThousand === "." ||
    searchParams.curThousand === " "
      ? (searchParams.curThousand as CurrencySettings["thousandSeparator"])
      : undefined;
  const decimalSeparator =
    searchParams.curDecimal === "." || searchParams.curDecimal === ","
      ? (searchParams.curDecimal as CurrencySettings["decimalSeparator"])
      : undefined;
  const showDecimals =
    searchParams.curDecimals === "1"
      ? true
      : searchParams.curDecimals === "0"
        ? false
        : undefined;
  const labelPosition =
    searchParams.curPos === "prefix" || searchParams.curPos === "suffix"
      ? (searchParams.curPos as CurrencySettings["labelPosition"])
      : undefined;

  const override: CurrencySettings = {
    defaultCurrency: defaultCurrency ?? "USD",
    label: label ?? "$",
    thousandSeparator: thousandSeparator ?? ",",
    decimalSeparator: decimalSeparator ?? ".",
    showDecimals: showDecimals ?? true,
    labelPosition: labelPosition ?? "prefix",
  };

  return override;
}
