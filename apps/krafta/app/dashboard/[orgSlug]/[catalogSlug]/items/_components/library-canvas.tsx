"use client";

/**
 * library-canvas.tsx — top-level Library Canvas component (KRA-35 PR2).
 *
 * The visible feature. Replaces the old DataTable-based ItemsPanel as the
 * default render of `/dashboard/[orgSlug]/[catalogSlug]/items`. The Table
 * view (legacy ItemsPanel) stays in the codebase but is no longer the
 * default; PR 3 wires the Canvas/Table toggle UI so merchants can switch.
 *
 * Composition:
 *   Library page (RSC, fetches data)
 *     └─ LibraryCanvas (client, this file)
 *         └─ CanvasWithSelection (client, provides selection + DndContext)
 *             ├─ Canvas main column
 *             │   ├─ Page header (title + Add item)
 *             │   ├─ Locale tab strip placeholder (PR 3)
 *             │   └─ For each category: CategorySection
 *             │       └─ SortableContext + SortableItemCards
 *             └─ Inspector (desktop side panel + mobile Drawer)
 *
 * Empty-state handling: if the catalog has zero items, render an empty
 * state with the "Add item" CTA highlighted. If categories exist but a
 * particular category has zero items, CategorySection shows its own
 * inline empty hint.
 *
 * The "Add item" button reuses the existing CreateItemFlowDialog from
 * ItemsPanel — no need to rebuild that surface for PR 2; the merchant's
 * mental model for adding items is the same as before.
 */

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { CanvasWithSelection } from "./canvas-with-selection";
import { CategorySection } from "./category-section";
import { Inspector } from "./inspector";
import { CreateItemFlowDialog } from "./create-item-flow-dialog";

type LocaleOption = {
  id: string;
  locale: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
};

type ItemTranslation = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

type ItemMedia = {
  id: string;
  item_id: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
  kind: "image" | "video";
  title: string | null;
  alt: string | null;
  position: number;
  is_primary: boolean;
};

export type LibraryCanvasProps = {
  catalogId: string;
  catalogSlug: string;
  orgId: string;
  categories: CatalogCategory[];
  items: Item[];
  /** Loaded for PR 3 locale tab strip and inspector translation rendering.
   *  PR 2 doesn't render the locale tabs yet but accepts the prop so the
   *  page-level data fetch stays unchanged. */
  locales: LocaleOption[];
  /** Loaded for PR 3 locale-aware editing in the inspector. PR 2 unused. */
  translations: ItemTranslation[];
  media: ItemMedia[];
  currencySettings: CurrencySettings;
};

export function LibraryCanvas({
  catalogId,
  catalogSlug,
  orgId,
  categories,
  items,
  locales,
  // translations is loaded at the page level and passed in for PR 3
  // locale-aware editing in the inspector; PR 2 doesn't render the
  // locale tab strip yet, so we accept the prop and ignore it. Leaving
  // the prop name out of destructure entirely (rather than prefixing
  // with `_translations`) keeps the lint clean without an eslint-disable.
  media,
  currencySettings,
}: LibraryCanvasProps) {
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);

  // Group items by category id for per-section rendering. Categories
  // without items still render (their inline empty hint shows). Items
  // whose category_id is missing or no longer matches a category are
  // collected into a synthetic "Uncategorized" bucket so they don't
  // silently disappear from the merchant's view.
  const sortedCategories = React.useMemo(
    () => [...categories].sort((a, b) => a.position - b.position),
    [categories],
  );

  const itemsByCategory = React.useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const cat of sortedCategories) {
      map.set(cat.id, []);
    }
    const orphans: Item[] = [];
    for (const item of items) {
      const bucket = map.get(item.category_id);
      if (bucket) {
        bucket.push(item);
      } else {
        orphans.push(item);
      }
    }
    return { map, orphans };
  }, [items, sortedCategories]);

  // Header: page title + "Add item" button. Same chrome the legacy
  // ItemsPanel shipped (`items-panel.tsx:113-127` for reference) —
  // intentional visual continuity so merchants who used the old page
  // recognize the canvas layout as "the Items page, redesigned" rather
  // than "a new section."
  const header = (
    <div className="w-full border-b">
      <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
        <div className="space-y-1">
          <h1 className="text-[32px] font-semibold tracking-tight">Library</h1>
        </div>
        <Button onClick={() => setItemDialogOpen(true)}>
          <Plus className="size-4" />
          Add item
        </Button>
      </div>
    </div>
  );

  return (
    <main className="w-full">
      {header}

      <CanvasWithSelection
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        items={items}
      >
        <div className="mx-auto flex max-w-[1248px] gap-6 px-6 py-6">
          {/* Canvas column. flex-1 so it expands; inspector pulls 360px
              on the right at md+. */}
          <div className="flex-1 min-w-0">
            {items.length === 0 ? (
              <EmptyCatalog onAddItem={() => setItemDialogOpen(true)} />
            ) : (
              <div className="flex flex-col gap-8">
                {sortedCategories.map((category) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    items={itemsByCategory.map.get(category.id) ?? []}
                    catalogId={catalogId}
                    catalogSlug={catalogSlug}
                    currencySettings={currencySettings}
                  />
                ))}

                {itemsByCategory.orphans.length > 0 && (
                  <CategorySection
                    category={{
                      id: "__orphans__",
                      catalog_id: catalogId,
                      name: "Uncategorized",
                      slug: "uncategorized",
                      position: 9999,
                      is_active: true,
                      created_at: "",
                    }}
                    items={itemsByCategory.orphans}
                    catalogId={catalogId}
                    catalogSlug={catalogSlug}
                    currencySettings={currencySettings}
                  />
                )}
              </div>
            )}
          </div>

          {/* Inspector: desktop side panel + mobile Drawer. The Inspector
              component handles its own responsive switch. */}
          <Inspector
            items={items}
            media={media}
            catalogId={catalogId}
            catalogSlug={catalogSlug}
            currencySettings={currencySettings}
          />
        </div>
      </CanvasWithSelection>

      {/* Add-item dialog — existing flow, reused intact. */}
      <CreateItemFlowDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        orgId={orgId}
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        categories={sortedCategories}
        locales={locales}
        mode="create"
      />
    </main>
  );
}

/**
 * EmptyCatalog — rendered when the catalog has zero items. Per DESIGN.md
 * "Empty states are features" guideline + Open Question §"empty state".
 *
 * Intentionally lightweight in PR 2: no vertical-tuned starter content
 * (that would couple to KRA-16 onboarding logic). Just a clear primary
 * CTA that points at the same Add Item dialog the header uses, with one
 * sentence of context so it doesn't feel like a 404.
 */
function EmptyCatalog({ onAddItem }: { onAddItem: () => void }) {
  return (
    <div className="rounded-md border border-dashed py-16 px-6 text-center">
      <h2 className="text-lg font-semibold">No items yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Build your menu by adding items to a category. Each item appears
        in the customer-facing catalog as soon as it&rsquo;s active.
      </p>
      <Button className="mt-6" onClick={onAddItem}>
        <Plus className="size-4" />
        Add your first item
      </Button>
    </div>
  );
}
