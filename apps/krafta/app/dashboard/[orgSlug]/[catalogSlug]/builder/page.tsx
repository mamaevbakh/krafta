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
import { getDashboardT } from "@/lib/locales/dashboard/server";
import type { DashboardMessageKey } from "@/lib/locales/dashboard/messages";
import Link from "next/link";

const HEADER_LABELS: Record<HeaderVariant, string> = {
  "header-basic": "Basic Header",
  "header-basic-free-logo": "Basic Header (Free Logo)",
  "header-center": "Centered Header",
  "header-hero": "Hero Header",
};

const SECTION_LABEL_KEY: Record<SectionVariant, DashboardMessageKey> = {
  "section-basic": "studio.section_basic",
  "section-separated": "studio.section_separated",
  "section-pill-tabs": "studio.section_pill_tabs",
};

const ITEM_CARD_LABEL_KEY: Record<ItemCardVariant, DashboardMessageKey> = {
  "card-big-photo": "studio.card_big_photo",
  "card-photo-row": "studio.card_photo_row",
  "card-minimal": "studio.card_minimal",
  "card-default": "studio.card_default",
  "card-glass-blur": "studio.card_glass_blur",
  "card-row-compact": "studio.card_row_compact",
};

const NAV_LABEL_KEY: Record<CategoryNavVariant, DashboardMessageKey> = {
  "nav-tabs": "studio.nav_sticky_tabs",
  "nav-tabs-motion": "studio.nav_sticky_tabs_motion",
  "nav-tabs-dashboard": "studio.nav_sticky_tabs_dashboard",
  "nav-none": "studio.nav_hidden",
};

const ITEM_DETAIL_LABELS: Record<
  CatalogLayoutSettings["itemDetailVariant"],
  string
> = {
  "item-fullscreen": "Fullscreen Modal",
};

type BuilderPageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function CatalogBuilderPage({
  params,
  searchParams,
}: BuilderPageProps) {
  const { catalogSlug, orgSlug } = await params;
  const { tab } = (await searchParams) ?? {};
  const t = await getDashboardT();
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
          {t("studio.catalog_not_found")}
        </div>
      </div>
    );
  }

  // studio_publishable_key (migration 20260629140000) isn't in generated types
  // yet — fetch it with an isolated cast. Set only for Studio-created coded shops.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column not in generated types until regen
  const studioDb = supabase as any;
  const { data: studioRow } = await studioDb
    .from("catalogs")
    .select("studio_publishable_key, published_url")
    .eq("id", catalog.id)
    .maybeSingle();
  const studioPublishableKey: string | null =
    studioRow?.studio_publishable_key ?? null;
  const studioPublishedUrl: string | null = studioRow?.published_url ?? null;

  const { layout, currency, behavior } = normalizeCatalogSettings(catalog);

  const headerOptions = headerVariants.map((variant) => ({
    value: variant,
    label: HEADER_LABELS[variant] ?? variant,
  }));
  const sectionOptions = sectionVariants.map((variant) => ({
    value: variant,
    label: t(SECTION_LABEL_KEY[variant]),
  }));
  const itemCardOptions = itemCardVariants.map((variant) => ({
    value: variant,
    label: t(ITEM_CARD_LABEL_KEY[variant]),
  }));
  const itemDetailOptions = itemDetailVariants.map((variant) => ({
    value: variant,
    label: ITEM_DETAIL_LABELS[variant] ?? variant,
  }));
  const navOptions = categoryNavVariants.map((variant) => ({
    value: variant,
    label: t(NAV_LABEL_KEY[variant]),
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
      initialBehavior={behavior}
      headerOptions={headerOptions}
      sectionOptions={sectionOptions}
      itemCardOptions={itemCardOptions}
      itemDetailOptions={itemDetailOptions}
      navOptions={navOptions}
      initialFocus={tab === "assistant" ? "assistant" : undefined}
      studioPublishableKey={studioPublishableKey}
      studioPublishedUrl={studioPublishedUrl}
      // eve (the codegen runtime) mounts only in local dev — see next.config.ts.
      // On Vercel the Studio chat would silently fail, so hide its tab there.
      codegenAvailable={!process.env.VERCEL}
    />
  );
}
