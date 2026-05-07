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
import { getOrgBillingEntitlement } from "@/lib/billing/entitlement";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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
  const { catalogSlug, orgSlug } = await params;
  const supabase = await createClient();
  const { data: orgRecord } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();
  const { data: catalog } = orgRecord?.id
    ? await supabase
        .from("catalogs")
        .select(
          "id,slug,name,description,logo_path,org_id,tags,settings_layout,settings_currency,settings_behavior",
        )
        .eq("org_id", orgRecord.id)
        .eq("slug", catalogSlug)
        .maybeSingle()
    : { data: null };
  if (!catalog) {
    return (
      <div className="mx-auto w-full max-w-[1248px] px-6 py-8">
        <div className="mt-8 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Catalog not found for studio preview.
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
    <CatalogBuilderPanel
      catalogId={catalog.id}
      orgId={catalog.org_id}
      catalogSlug={catalogSlug}
      catalogName={catalog.name}
      catalogLogoPath={catalog.logo_path}
      initialLayout={layout}
      initialCurrency={currency}
      headerOptions={headerOptions}
      sectionOptions={sectionOptions}
      itemCardOptions={itemCardOptions}
      itemDetailOptions={itemDetailOptions}
      navOptions={navOptions}
    />
  );
}
