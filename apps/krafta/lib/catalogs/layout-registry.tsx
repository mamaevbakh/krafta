// lib/catalogs/layout-registry.tsx
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { Catalog, CategoryWithItems, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";


// Headers
import { CatalogHeader } from "@/components/catalogs/headers/header-basic";
import { CatalogHeaderBasicFreeLogo } from "@/components/catalogs/headers/header-basic-free-logo";
import { CatalogHeaderCenter } from "@/components/catalogs/headers/header-center";
import { CatalogHeaderHero } from "@/components/catalogs/headers/header-hero";

// Item cards
import { MinimalCard } from "@/components/catalogs/cards/card-minimal";
import { BigPhotoCard } from "@/components/catalogs/cards/card-photo-big";
import { CatalogItemCard } from "@/components/catalogs/cards/card-default";
import { PhotoRowCard } from "@/components/catalogs/cards/card-photo-row";
import { GlassBlurCard } from "@/components/catalogs/cards/card-glass-blur";
import { ItemDetailSheet } from "@/components/catalogs/items/item-detail-sheet-view";
import { ItemDetailFullscreen } from "@/components/catalogs/items/item-detail-fullscreen-view";

// Sections
import { SectionBasic } from "@/components/catalogs/sections/section-basic";
import { SectionSeparated } from "@/components/catalogs/sections/section-separated";
import { SectionPillTabs } from "@/components/catalogs/sections/section-pill-tabs";

// Category nav
import { CategoryNavTabs } from "@/components/catalogs/navbars/category-nav-tabs";
import { CategoryNavTabsMotion } from "@/components/catalogs/navbars/category-nav-tabs-motion";
import { CategoryNavTabsDashboard } from "@/components/catalogs/navbars/category-nav-tabs-dashboard";


export type HeaderProps = {
  catalogName: string;
  description: string | null;
  catalog: Catalog;
  logoUrl: string | null;
  tags: string[] | null;
};

export type CategoryNavProps = {
  categories: CategoryWithItems[];
  activeCategoryId?: string | null;
  baseHref: string;
  activeCategorySlug?: string | null;
};

export type SectionProps = {
  category: CategoryWithItems;
  children: React.ReactNode;
};

export type ItemCardProps = {
  item: Item;
  imageUrl: string | null;
  imageAspectRatio?: number;
  columns?: number;
  currencySettings?: CurrencySettings;
};

export type ItemDetailProps = {
  item: Item;
  category: CategoryWithItems | null;
  imageUrl: string | null;
  itemAspectRatio?: number;
  backHref?: string;
  onClose?: () => void;
  currencySettings?: CurrencySettings;
};

export type ItemDetailRegistryEntry = {
  Component: React.ComponentType<ItemDetailProps>;
  drawerClassName?: string;
};

export type ItemDetailComponent =
  React.ComponentType<ItemDetailProps>;

// HEADER VARIANTS
const headerRegistry: Record<
  CatalogLayoutSettings["headerVariant"],
  React.ComponentType<HeaderProps>
> = {
  "header-basic": CatalogHeader,
  "header-basic-free-logo": CatalogHeaderBasicFreeLogo,
  "header-center": CatalogHeaderCenter,
  "header-hero": CatalogHeaderHero,
};

const categoryNavRegistry: Record<
  CatalogLayoutSettings["categoryNavVariant"],
  React.ComponentType<CategoryNavProps> | null
> = {
  "nav-none": null,
  "nav-tabs": CategoryNavTabs,
  "nav-tabs-motion": CategoryNavTabsMotion,
  "nav-tabs-dashboard": CategoryNavTabsDashboard,
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
  "card-glass-blur": GlassBlurCard,
};

const itemDetailRegistry: Record<
  CatalogLayoutSettings["itemDetailVariant"],
  ItemDetailRegistryEntry
> = {
  "item-sheet": {
    Component: ItemDetailSheet,
  },
  "item-fullscreen": {
    Component: ItemDetailFullscreen,
    drawerClassName: "h-[100dvh] p-0",
  },
};

export const headerVariants = Object.keys(
  headerRegistry,
) as CatalogLayoutSettings["headerVariant"][];
export const categoryNavVariants = Object.keys(
  categoryNavRegistry,
) as CatalogLayoutSettings["categoryNavVariant"][];
export const sectionVariants = Object.keys(
  sectionRegistry,
) as CatalogLayoutSettings["sectionVariant"][];
export const itemCardVariants = Object.keys(
  itemCardRegistry,
) as CatalogLayoutSettings["itemCardVariant"][];
export const itemDetailVariants = Object.keys(
  itemDetailRegistry,
) as CatalogLayoutSettings["itemDetailVariant"][];

export function resolveCatalogLayout(layout: CatalogLayoutSettings) {
  const detailEntry = itemDetailRegistry[layout.itemDetailVariant];

  return {
    Header: headerRegistry[layout.headerVariant],
    Section: sectionRegistry[layout.sectionVariant],
    ItemCard: itemCardRegistry[layout.itemCardVariant],
    CategoryNav: categoryNavRegistry[layout.categoryNavVariant],
    ItemDetail: detailEntry.Component,
    itemDetailDrawerClassName: detailEntry.drawerClassName,
  };
}
