// lib/catalogs/layout-registry.tsx
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
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
  catalog: PublicCatalog;
  headerSettings: CatalogLayoutSettings["header"];
  logoUrl: string | null;
  tags: string[] | null;
};

export type CategoryNavProps = {
  categories: PublicCategoryWithItems[];
  activeCategoryId?: string | null;
  baseHref: string;
  activeCategorySlug?: string | null;
};

export type SectionProps = {
  category: PublicCategoryWithItems;
  children: React.ReactNode;
};

export type ItemCardProps = {
  item: PublicItem;
  imageUrl: string | null;
  imageAspectRatio?: number;
  columns?: number;
  currencySettings?: CurrencySettings;
};

export type ItemDetailProps = {
  item: PublicItem;
  category: PublicCategoryWithItems | null;
  imageUrl: string | null;
  itemAspectRatio?: number;
  backHref?: string;
  onClose?: () => void;
  currencySettings?: CurrencySettings;
};

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
export const itemDetailVariants = [
  "item-sheet",
  "item-fullscreen",
] as CatalogLayoutSettings["itemDetailVariant"][];

export function resolveCatalogLayout(layout: CatalogLayoutSettings) {
  return {
    Header: headerRegistry[layout.headerVariant],
    Section: sectionRegistry[layout.sectionVariant],
    ItemCard: itemCardRegistry[layout.itemCardVariant],
    CategoryNav: categoryNavRegistry[layout.categoryNavVariant],
  };
}
