"use client";

// KRA-42 wizard PR 2 — the merchant's draft menu rendered through the REAL
// storefront components (layout-registry variants), entirely client-side
// from wizard state. No shop row exists yet, so no fetch, no RLS, no
// network: synthetic Public* shapes feed the same Header/Section/ItemCard
// the customer route uses.
//
// Two consumers, one component:
//   * the Look screen — four scaled-down instances, one per preset
//   * the reveal screen — full-size inside a phone frame
//
// CategoryNav is deliberately omitted: it's sticky scroll chrome that adds
// nothing inside a static, pointer-events-none frame.

import * as React from "react";

import { resolveCatalogLayout } from "@/lib/catalogs/layout-registry";
import { normalizeLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
import { cn } from "@/lib/utils";

import { LOOK_PRESETS, type LookKey } from "./presets";

export type PreviewSection = {
  name: string;
  items: { name: string; priceCents: number }[];
};

const PREVIEW_CURRENCY: CurrencySettings = {
  defaultCurrency: "UZS",
  label: "сум",
  labelPosition: "suffix",
  thousandSeparator: " ",
  decimalSeparator: ",",
  showDecimals: false,
};

function getItemGridColsClass(columns: number): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 3:
      return "grid-cols-3";
    case 4:
      return "grid-cols-4";
    default:
      return "grid-cols-2";
  }
}

function syntheticItem(
  sectionIdx: number,
  itemIdx: number,
  name: string,
  priceCents: number,
): PublicItem {
  const id = `preview-i-${sectionIdx}-${itemIdx}`;
  return {
    id,
    slug: id,
    category_id: `preview-c-${sectionIdx}`,
    name,
    description: null,
    image_path: null,
    image_alt: null,
    position: itemIdx,
    price_cents: priceCents,
    variations: [
      {
        id: `${id}-v`,
        name: "Стандарт",
        price_cents: priceCents,
        ordinal: 0,
        is_default: true,
        is_sold_out: false,
        translations: [],
      },
    ],
    modifier_lists: [],
    translations: [],
  };
}

export function WizardLookPreview({
  look,
  shopName,
  sections,
  className,
  maxSections = 2,
  maxItemsPerSection = 3,
}: {
  look: LookKey;
  shopName: string;
  sections: PreviewSection[];
  className?: string;
  maxSections?: number;
  maxItemsPerSection?: number;
}) {
  const layout = normalizeLayoutSettings(LOOK_PRESETS[look].layout);
  const { Header, Section, ItemCard } = resolveCatalogLayout(layout);

  const catalog: PublicCatalog = {
    id: "preview",
    slug: "preview",
    name: shopName,
    description: null,
    logo_path: null,
    org_id: "preview",
    tags: null,
    settings_layout: null,
    settings_currency: null,
    settings_behavior: null,
  };

  const categories: PublicCategoryWithItems[] = sections
    .slice(0, maxSections)
    .map((s, sIdx) => ({
      id: `preview-c-${sIdx}`,
      slug: `preview-c-${sIdx}`,
      name: s.name,
      position: sIdx,
      description: null,
      translations: [],
      items: s.items
        .slice(0, maxItemsPerSection)
        .map((i, iIdx) => syntheticItem(sIdx, iIdx, i.name, i.priceCents)),
    }));

  // Row-style cards read best single-column regardless of the default
  // columns setting; photo/minimal cards keep the layout's grid.
  const columns =
    layout.itemCardVariant === "card-row-compact" ||
    layout.itemCardVariant === "card-photo-row"
      ? 1
      : layout.itemCard.columns;

  return (
    <div
      aria-hidden="true"
      // `inert` (not just pointer-events-none): the real storefront headers
      // ship interactive chrome (theme toggle), which must leave the tab
      // order entirely inside a decorative preview.
      inert
      className={cn(
        "pointer-events-none select-none bg-background text-foreground",
        className,
      )}
    >
      <Header
        catalogName={shopName}
        description={null}
        catalog={catalog}
        headerSettings={layout.header}
        logoUrl={null}
        tags={null}
        locales={[]}
        activeLocale="ru"
      />
      <div className="flex flex-col gap-5 px-4 pb-6">
        {categories.map((category) => (
          <Section
            key={category.id}
            category={category}
            activeLocale="ru"
            defaultLocale="ru"
          >
            <div className={cn("grid gap-3", getItemGridColsClass(columns))}>
              {category.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  imageUrl={null}
                  columns={columns}
                  currencySettings={PREVIEW_CURRENCY}
                  activeLocale="ru"
                  defaultLocale="ru"
                />
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
