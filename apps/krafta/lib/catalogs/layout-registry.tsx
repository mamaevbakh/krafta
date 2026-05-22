// lib/catalogs/layout-registry.tsx
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";


// Headers
import { CatalogHeader } from "@/components/catalogs/headers/header-basic";
import { CatalogHeaderBasicFreeLogo } from "@/components/catalogs/headers/header-basic-free-logo";
import { CatalogHeaderCenter } from "@/components/catalogs/headers/header-center";
import { CatalogHeaderHero } from "@/components/catalogs/headers/header-hero";

// Item cards
import { MinimalCard } from "@/components/catalogs/cards/card-minimal";
import { BigPhotoCard } from "@/components/catalogs/cards/card-photo-big";
import { CustomerItemCard } from "@/components/catalogs/cards/card-default";
import { PhotoRowCard } from "@/components/catalogs/cards/card-photo-row";
import { GlassBlurCard } from "@/components/catalogs/cards/card-glass-blur";
import { RowCompactCard } from "@/components/catalogs/cards/card-row-compact";

// Sections
import { SectionBasic } from "@/components/catalogs/sections/section-basic";
import { SectionSeparated } from "@/components/catalogs/sections/section-separated";
import { SectionPillTabs } from "@/components/catalogs/sections/section-pill-tabs";

// Category nav
import { CategoryNavTabs } from "@/components/catalogs/navbars/category-nav-tabs";
import { CategoryNavTabsMotion } from "@/components/catalogs/navbars/category-nav-tabs-motion";
import { CategoryNavTabsDashboard } from "@/components/catalogs/navbars/category-nav-tabs-dashboard";


// Locale props every layout-registered component receives. activeLocale +
// defaultLocale flow from the page root (resolved from ?lang= against the
// catalog's enabled set) and feed into pickLocalizedField at each render
// site. Empty strings mean "no localization configured" — components just
// render canonical values.
export type LocaleProps = {
  activeLocale: string;
  defaultLocale: string;
};

export type HeaderProps = {
  catalogName: string;
  description: string | null;
  catalog: PublicCatalog;
  headerSettings: CatalogLayoutSettings["header"];
  logoUrl: string | null;
  tags: string[] | null;
  /** Enabled locale rows from getCatalogLocales(). Headers render the
   *  LocaleSwitcher from this; an empty / single-element array yields
   *  no visible switcher. */
  locales: PublicCatalogLocaleOption[];
  /** Effective active locale from the page root. Drives the switcher's
   *  current selection. */
  activeLocale: string;
};

export type CategoryNavProps = LocaleProps & {
  categories: PublicCategoryWithItems[];
  activeCategoryId?: string | null;
  baseHref: string;
  activeCategorySlug?: string | null;
};

export type SectionProps = LocaleProps & {
  category: PublicCategoryWithItems;
  children: React.ReactNode;
};

export type ItemCardProps = LocaleProps & {
  item: PublicItem;
  imageUrl: string | null;
  imageAspectRatio?: number;
  columns?: number;
  currencySettings?: CurrencySettings;
  /** Hint that this card is likely in the first viewport. Card variants
   *  forward this to next/image as `priority`, which tells the browser
   *  to fetch the image early (preload tag, no lazy-load). Set on the
   *  first handful of items by the layout to improve LCP. */
  priority?: boolean;
};

export type ItemDetailProps = LocaleProps & {
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
  "card-default": CustomerItemCard,
  "card-glass-blur": GlassBlurCard,
  "card-row-compact": RowCompactCard,
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
