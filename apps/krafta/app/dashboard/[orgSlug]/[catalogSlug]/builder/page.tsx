import {
  categoryNavVariants,
  headerVariants,
  itemDetailVariants,
  itemCardVariants,
  sectionVariants,
} from "@/lib/catalogs/layout-registry";
import { CatalogBuilderPanel } from "@/components/dashboard/catalog-builder-panel";
import type {
  CategoryNavVariant,
  HeaderVariant,
  CatalogLayoutSettings,
  ItemCardVariant,
  SectionVariant,
} from "@/lib/catalogs/settings/layout";
import { normalizeCatalogSettings } from "@/lib/catalogs/settings";
import { getCatalogBySlug } from "@/lib/catalogs/data";

const HEADER_LABELS: Record<HeaderVariant, string> = {
  "header-basic": "Basic Header",
  "header-basic-free-logo": "Basic Header (Free Logo)",
  "header-center": "Centered Header",
  "header-hero": "Hero Header",
};

const SECTION_LABELS: Record<SectionVariant, string> = {
  "section-basic": "Basic",
  "section-separated": "Separated",
  "section-pill-tabs": "Pill Tabs",
};

const ITEM_CARD_LABELS: Record<ItemCardVariant, string> = {
  "card-big-photo": "Big Photo",
  "card-photo-row": "Photo Row",
  "card-minimal": "Minimal",
  "card-default": "Default",
  "card-glass-blur": "Glass Blur",
};

const NAV_LABELS: Record<CategoryNavVariant, string> = {
  "nav-tabs": "Sticky Tabs",
  "nav-tabs-motion": "Sticky Tabs (Motion)",
  "nav-tabs-dashboard": "Sticky Tabs (Dashboard)",
  "nav-none": "Hidden",
};

const ITEM_DETAIL_LABELS: Record<
  CatalogLayoutSettings["itemDetailVariant"],
  string
> = {
  "item-sheet": "Item Sheet",
  "item-fullscreen": "Fullscreen Modal",
};

type BuilderPageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function CatalogBuilderPage({
  params,
}: BuilderPageProps) {
  const { catalogSlug } = await params;
  const catalog = await getCatalogBySlug(catalogSlug);
  if (!catalog) {
    return (
      <div className="mx-auto w-full max-w-[1248px] px-6 py-8">
        <div className="mt-8 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Catalog not found for builder preview.
        </div>
      </div>
    );
  }

  const { layout, currency } = normalizeCatalogSettings(catalog);

  const headerOptions = headerVariants.map((variant) => ({
    value: variant,
    label: HEADER_LABELS[variant] ?? variant,
  }));
  const sectionOptions = sectionVariants.map((variant) => ({
    value: variant,
    label: SECTION_LABELS[variant] ?? variant,
  }));
  const itemCardOptions = itemCardVariants.map((variant) => ({
    value: variant,
    label: ITEM_CARD_LABELS[variant] ?? variant,
  }));
  const itemDetailOptions = itemDetailVariants.map((variant) => ({
    value: variant,
    label: ITEM_DETAIL_LABELS[variant] ?? variant,
  }));
  const navOptions = categoryNavVariants.map((variant) => ({
    value: variant,
    label: NAV_LABELS[variant] ?? variant,
  }));

  return (
    <div className="mx-auto w-full max-w-[1248px] px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Catalog Builder
        </p>
        <h1 className="text-[32px] font-semibold tracking-tight">
          Choose your look
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pick components for headers, sections, item cards, and navigation.
          The preview updates on the right.
        </p>
      </header>

      <CatalogBuilderPanel
        catalogId={catalog.id}
        catalogSlug={catalogSlug}
        initialLayout={layout}
        initialCurrency={currency}
        headerOptions={headerOptions}
        sectionOptions={sectionOptions}
        itemCardOptions={itemCardOptions}
        itemDetailOptions={itemDetailOptions}
        navOptions={navOptions}
      />
    </div>
  );
}
