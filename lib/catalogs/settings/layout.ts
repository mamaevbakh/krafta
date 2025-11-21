// lib/catalogs/settings/layout.ts
export type HeaderVariant =
  | "header-basic"
  | "header-center"
  | "header-hero";

export type CategoryNavVariant =
  | "none"
  | "tabs"
  | "sidebar";

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
  categoryNavVariant?: CategoryNavVariant;
};

export const defaultLayoutSettings: CatalogLayoutSettings = {
  headerVariant: "header-center",
  sectionVariant: "section-pill-tabs",
  itemCardVariant: "card-big-photo",
  categoryNavVariant: "none",
};