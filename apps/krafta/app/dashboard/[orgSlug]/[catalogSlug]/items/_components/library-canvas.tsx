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
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { CanvasWithSelection } from "./canvas-with-selection";
import { CategorySection } from "./category-section";
import { CategoryRail } from "./category-rail";
import { EditorSheet } from "./editor-sheet";
import { CreateItemFlowDialog } from "./create-item-flow-dialog";
import { CanvasLocaleProvider } from "./locale-context";
import { LocaleTabStrip } from "./locale-tab-strip";

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

/** Optimistic reorder action shape. Used by useOptimistic in this file
 *  and by CanvasWithSelection's drag-end handler. Kept here to avoid a
 *  shared types file for a single 3-field type. */
export type OptimisticReorderAction = {
  activeId: string;
  overId: string;
  /** Set when the drag crosses a category boundary. Undefined for
   *  intra-category reorders. */
  newCategoryId?: string;
};

/** Optimistic category-reorder action. The active and over ids here are
 *  the dnd-kit category sortable ids (`category-<uuid>`), not the raw
 *  category uuids — the canvas-with-selection drag handler strips the
 *  prefix before dispatching. We accept the bare uuids in the reducer. */
export type OptimisticCategoryReorderAction = {
  activeId: string;
  overId: string;
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
  translations,
  media,
  currencySettings,
}: LibraryCanvasProps) {
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);

  // Optimistic reorder state (React 19 useOptimistic + startTransition).
  // Why: dnd-kit's onDragEnd previously did `reorderItems` server action +
  // `router.refresh()`. The visual snap-back during the round-trip felt
  // janky (~400-800ms of delay). With useOptimistic, the local state
  // updates synchronously when the drag completes; if the server call
  // succeeds the optimistic order matches the refreshed RSC data, if it
  // fails React auto-reverts to `items` (the prop). See
  // canvas-with-selection.tsx for the dispatcher call inside the drag-end
  // handler.
  const [optimisticItems, applyOptimisticReorder] = React.useOptimistic(
    items,
    (state: Item[], action: OptimisticReorderAction): Item[] => {
      const sorted = [...state].sort((a, b) => a.position - b.position);
      const activeIdx = sorted.findIndex((i) => i.id === action.activeId);
      if (activeIdx < 0) return state;

      // Case A — drop on a category section root (over.id is
      // `category-<uuid>`, e.g. dropping into a collapsed section). Place
      // the active at the END of that category. Section stays in
      // whatever collapse state it was; a toast on dragEnd confirms the
      // move so the merchant doesn't need to expand to verify.
      if (action.overId.startsWith("category-")) {
        const targetCategoryId = action.overId.slice("category-".length);
        const [moved] = sorted.splice(activeIdx, 1);
        // Find the index just AFTER the last item belonging to the
        // target category. If the target has no items yet, insert at end.
        let insertAt = sorted.length;
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].category_id === targetCategoryId) {
            insertAt = i + 1;
            break;
          }
        }
        sorted.splice(insertAt, 0, { ...moved, category_id: targetCategoryId });
        return sorted.map((item, idx) => ({ ...item, position: idx }));
      }

      // Case B — drop on another item. arrayMove semantics: place active
      // at `overIdx` in the resulting array, all other items shift to
      // compensate. Cross-category sets the active's new category_id.
      const overIdx = sorted.findIndex((i) => i.id === action.overId);
      if (overIdx < 0) return state;
      const [moved] = sorted.splice(activeIdx, 1);
      sorted.splice(overIdx, 0, moved);
      return sorted.map((item, idx) => ({
        ...item,
        position: idx,
        category_id:
          item.id === action.activeId && action.newCategoryId
            ? action.newCategoryId
            : item.category_id,
      }));
    },
  );

  // Optimistic category reorder (mirror of the items optimistic state).
  // When the merchant drags a category section header, the dnd-kit handler
  // in CanvasWithSelection dispatches this reducer inside startTransition
  // so the section appears in its new slot synchronously. The server
  // call follows; on success router.refresh() syncs `categories`. On
  // failure React auto-reverts the transition.
  const [optimisticCategories, applyOptimisticCategoryReorder] =
    React.useOptimistic(
      categories,
      (
        state: CatalogCategory[],
        action: OptimisticCategoryReorderAction,
      ): CatalogCategory[] => {
        const sorted = [...state].sort((a, b) => a.position - b.position);
        const activeIdx = sorted.findIndex((c) => c.id === action.activeId);
        const overIdx = sorted.findIndex((c) => c.id === action.overId);
        if (activeIdx < 0 || overIdx < 0) return state;
        const [moved] = sorted.splice(activeIdx, 1);
        sorted.splice(overIdx, 0, moved);
        return sorted.map((category, idx) => ({
          ...category,
          position: idx,
        }));
      },
    );

  // Group items by category id for per-section rendering. Categories
  // without items still render (their inline empty hint shows). Items
  // whose category_id is missing or no longer matches a category are
  // collected into a synthetic "Uncategorized" bucket so they don't
  // silently disappear from the merchant's view.
  const sortedCategories = React.useMemo(
    () => [...optimisticCategories].sort((a, b) => a.position - b.position),
    [optimisticCategories],
  );

  // NOTE: bucketing uses `optimisticItems`, NOT the raw `items` prop. This
  // is the key piece that makes drag feedback feel instant — the rendered
  // category sections see the moved item in its new bucket synchronously.
  const itemsByCategory = React.useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const cat of sortedCategories) {
      map.set(cat.id, []);
    }
    const orphans: Item[] = [];
    for (const item of optimisticItems) {
      const bucket = map.get(item.category_id);
      if (bucket) {
        bucket.push(item);
      } else {
        orphans.push(item);
      }
    }
    return { map, orphans };
  }, [optimisticItems, sortedCategories]);

  // Header: page title + "Add item" button. Same chrome the legacy
  // ItemsPanel shipped (`items-panel.tsx:113-127` for reference) —
  // intentional visual continuity so merchants who used the old page
  // recognize the canvas layout as "the Items page, redesigned" rather
  // than "a new section."
  const header = (
    <div className="w-full border-b">
      <div className="mx-auto flex h-[120px] max-w-[1248px] flex-col justify-center gap-2 px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[32px] font-semibold tracking-tight">Library</h1>
          <Button onClick={() => setItemDialogOpen(true)}>
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
        <LocaleTabStrip locales={locales} />
      </div>
    </div>
  );

  return (
    <main className="w-full">
      <CanvasLocaleProvider locales={locales}>
        {header}

        <CanvasWithSelection
          catalogId={catalogId}
          catalogSlug={catalogSlug}
          items={optimisticItems}
          categories={sortedCategories}
          translations={translations}
          currencySettings={currencySettings}
          onOptimisticReorder={applyOptimisticReorder}
          onOptimisticCategoryReorder={applyOptimisticCategoryReorder}
        >
          <div className="mx-auto flex max-w-[1248px] gap-6 px-6 py-6">
            {/* Category rail (KRA-35 Iter 2 / T3). Subordinate inset, no
                border per Pass 1 D1A. Hidden ≤xl (1280px) and on mobile. */}
            <CategoryRail
              categories={sortedCategories}
              hasOrphans={itemsByCategory.orphans.length > 0}
            />

            {/* Canvas column. flex-1 so it expands. EditorSheet portals
                via shadcn Sheet/Drawer — doesn't live in this flex row. */}
            <div className="flex-1 min-w-0">
              {optimisticItems.length === 0 ? (
                <EmptyCatalog onAddItem={() => setItemDialogOpen(true)} />
              ) : (
                // gap-3 between sections (12px) — tight enough that the
                // all-collapsed view reads as a compact list of headers,
                // loose enough that expanded sections still have visual
                // breathing room (their internal pt-3 + items' gap-2 give
                // the lower spacing). Earlier gap-8 felt cavernous when
                // all categories were collapsed.
                <div className="flex flex-col gap-3">
                  {/* SortableContext for category headers (KRA-91 drag-
                      reorder). Only real categories are in the items[]
                      list — the orphans bucket below is rendered as a
                      static section with sortable={false} so it can't
                      be reordered (it has no DB row to update). */}
                  <SortableContext
                    items={sortedCategories.map((c) => `category-${c.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sortedCategories.map((category) => (
                      <CategorySection
                        key={category.id}
                        category={category}
                        items={itemsByCategory.map.get(category.id) ?? []}
                        translations={translations}
                        currencySettings={currencySettings}
                        catalogId={catalogId}
                      />
                    ))}
                  </SortableContext>

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
                      translations={translations}
                      currencySettings={currencySettings}
                      catalogId={catalogId}
                      sortable={false}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* EditorSheet (KRA-35 Iter 2 / T2) replaces the legacy Inspector.
              Desktop: right-side Sheet ~800px. Mobile: Drawer 95dvh.
              MUST live inside <CanvasWithSelection> because the form
              calls useCanvasSelection (selectedItemId + pulseItem). Sheet
              portals to <body> for actual DOM rendering — placement
              inside the provider only affects context lookup, not the
              visual stacking. Receives optimisticItems so a just-dragged
              item's selection reflects its new category_id without
              waiting for router.refresh. */}
          <EditorSheet
            items={optimisticItems}
            categories={sortedCategories}
            media={media}
            translations={translations}
            catalogId={catalogId}
            catalogSlug={catalogSlug}
            currencySettings={currencySettings}
          />
        </CanvasWithSelection>
      </CanvasLocaleProvider>

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
  // Left-aligned per DESIGN.md rule 10 (no `text-center` on body copy).
  // Heading + paragraph + CTA stack left so the body text reads naturally;
  // the dashed border + generous `py-16` carry the "empty state" weight.
  return (
    <div className="rounded-md border border-dashed py-16 px-6">
      <h2 className="text-lg font-semibold">No items yet</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
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
