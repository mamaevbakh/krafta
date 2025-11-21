// lib/catalogs/layout-registry.tsx
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { Catalog, CategoryWithItems, Item } from "@/lib/catalogs/types";


// Headers
import { CatalogHeader } from "@/components/catalogs/headers/header-basic";

// Navbars
import { CategoryNavTabs } from "@/components/catalogs/navbars/category-nav-tabs";

// Item cards
import { MinimalCard } from "@/components/catalogs/cards/card-minimal";
import { BigPhotoCard } from "@/components/catalogs/cards/card-photo-big";
import { CatalogItemCard } from "@/components/catalogs/cards/card-default";
import { PhotoRowCard } from "@/components/catalogs/cards/card-photo-row";

// Sections
import { SectionBasic } from "@/components/catalogs/sections/section-basic";
import { SectionSeparated } from "@/components/catalogs/sections/section-separated";
import { SectionPillTabs } from "@/components/catalogs/sections/section-pill-tabs";



export type HeaderProps = {
  catalogName: string;
  description: string | null;
  catalog: Catalog;
  logoUrl: string | null;
};

export type CategoryNavProps = {
  categories: CategoryWithItems[];
  activeCategoryId?: string | null;
  baseHref: string;
};

export type SectionProps = {
  category: CategoryWithItems;
  children: React.ReactNode;
};

export type ItemCardProps = {
  item: Item;
  imageUrl: string | null;
};

// HEADER VARIANTS
const headerRegistry: Record<
  CatalogLayoutSettings["headerVariant"],
  React.ComponentType<HeaderProps>
> = {
  "header-basic": CatalogHeader,
  "header-center": CatalogHeader,
  "header-hero": CatalogHeader,
};

const categoryNavRegistry: Record<
  NonNullable<CatalogLayoutSettings["categoryNavVariant"]>,
  React.ComponentType<CategoryNavProps> | null
> = {
  none: null,
  tabs: CategoryNavTabs,
  sidebar: null,
};

// SECTION VARIANTS
const sectionRegistry: Record<
  CatalogLayoutSettings["sectionVariant"],
  React.ComponentType<SectionProps>
> = {
  "section-basic": SectionBasic,
  "section-separated": SectionSeparated,
  "section-pill-tabs": SectionPillTabs,
};

// ITEM CARD VARIANTS
const itemCardRegistry: Record<
  CatalogLayoutSettings["itemCardVariant"],
  React.ComponentType<ItemCardProps>
> = {
  "card-big-photo": BigPhotoCard,
  "card-minimal": MinimalCard,
  "card-photo-row": PhotoRowCard,
  "card-default": CatalogItemCard,
};

export function resolveCatalogLayout(layout: CatalogLayoutSettings) {
const categoryNavVariant = layout.categoryNavVariant ?? "none";
  return {
    Header: headerRegistry[layout.headerVariant],
    Section: sectionRegistry[layout.sectionVariant],
    ItemCard: itemCardRegistry[layout.itemCardVariant],
    CategoryNav: categoryNavRegistry[categoryNavVariant],
  };
}
