// lib/catalogs/settings/layout.ts
export type HeaderVariant = "header-basic" | "header-center" | "header-hero";

export type CategoryNavVariant = "nav-tabs" | "nav-none";

export type SectionVariant =
  | "section-basic"
  | "section-separated"
  | "section-pill-tabs";

export type ItemCardVariant =
  | "card-big-photo"
  | "card-minimal"
  | "card-photo-row"
  | "card-default";

export type CatalogLayoutSettings = {
  headerVariant: HeaderVariant;
  sectionVariant: SectionVariant;
  itemCardVariant: ItemCardVariant;
  categoryNavVariant: CategoryNavVariant;
  itemImageRatio?: string | null;
};

export const defaultLayoutSettings: CatalogLayoutSettings = {
  headerVariant: "header-center",
  sectionVariant: "section-pill-tabs",
  itemCardVariant: "card-big-photo",
  categoryNavVariant: "nav-tabs",
  itemImageRatio: "4:3",
};

function normalizeCategoryNavVariant(
  rawVariant: string | null | undefined,
): CategoryNavVariant {
  switch (rawVariant) {
    case "nav-none":
    case "none":
      return "nav-none";
    case "nav-tabs":
    case "tabs":
      return "nav-tabs";
    default:
      return "nav-tabs";
  }
}

export function normalizeLayoutSettings(
  layoutRaw: Partial<CatalogLayoutSettings> | Record<string, unknown> = {},
): CatalogLayoutSettings {
  const raw = layoutRaw as Partial<CatalogLayoutSettings> & {
    categoryNavVariant?: string | null;
    itemImageRatio?: string | null;
  };

  return {
    headerVariant:
      raw.headerVariant ?? defaultLayoutSettings.headerVariant,
    sectionVariant:
      raw.sectionVariant ?? defaultLayoutSettings.sectionVariant,
    itemCardVariant:
      raw.itemCardVariant ?? defaultLayoutSettings.itemCardVariant,
    categoryNavVariant: normalizeCategoryNavVariant(raw.categoryNavVariant),
    itemImageRatio: raw.itemImageRatio ?? defaultLayoutSettings.itemImageRatio,
  };
}
