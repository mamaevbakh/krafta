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
 * The "Add item" button opens the unified EditorSheet in CREATE mode
 * via startCreating(categoryId) from useCanvasSelection. The pre-KRA-88
 * CreateItemFlowDialog is gone; both create and edit flows share the
 * same sheet now.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { reorderItems } from "./actions";

import { CanvasWithSelection } from "./canvas-with-selection";
import { CategorySection } from "./category-section";
import { CategoryRail } from "./category-rail";
import { EditorSheet } from "./editor-sheet";
import { useCanvasSelection } from "./canvas-with-selection";
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
  const router = useRouter();
  // (Pre-KRA-88 unified-editor: this used to host CreateItemFlowDialog's
  // open state. Replaced by the EditorSheet's create branch — the
  // "Add item" button now calls startCreating(categoryId) from
  // useCanvasSelection. See PageHeader below.)

  // Pure reducer for an item reorder action. Used by BOTH:
  //   - the during-drag `previewItems` state (plain useState, mutated
  //     synchronously on each onDragOver — see below), and
  //   - useOptimistic for the dragEnd → server roundtrip.
  // Why share: both consumers compute the same end-state from an action;
  // duplicating the logic risks drift.
  const applyReorderAction = React.useCallback(
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
    [],
  );

  // Optimistic reorder for the dragEnd → server roundtrip. Persists
  // during the async transition wrapping reorderItems(); auto-reverts
  // on failure.
  const [optimisticItems, applyOptimisticReorder] = React.useOptimistic(
    items,
    applyReorderAction,
  );

  // During-drag preview state. Plain React state so it persists for the
  // WHOLE drag (not just one transition tick). canvas-with-selection's
  // onDragOver mutates this on each cross-category transition; cleared
  // on dragEnd / dragCancel. effectiveItems = preview ?? optimistic ?? items.
  //
  // Why a separate state from useOptimistic: useOptimistic only persists
  // optimistic state DURING an open transition. onDragOver dispatches
  // are sync transitions that complete immediately, so the optimistic
  // state would revert before the next paint — the merchant would see
  // no preview at all. Plain useState bypasses that.
  const [previewItems, setPreviewItems] = React.useState<Item[] | null>(null);

  // Clear the preview whenever the items prop changes (i.e. after a
  // successful server refresh): the canonical items are now what the
  // preview was showing, no need to override anymore.
  React.useEffect(() => {
    setPreviewItems(null);
  }, [items]);

  // Effective rendering source.
  const effectiveItems = previewItems ?? optimisticItems;

  // Dispatcher passed to CanvasWithSelection's handleDragOver. Mutates
  // the preview state by applying the action on top of the current
  // effective layout.
  const handleDragPreview = React.useCallback(
    (action: OptimisticReorderAction) => {
      setPreviewItems((current) => {
        const base = current ?? optimisticItems;
        return applyReorderAction(base, action);
      });
    },
    [optimisticItems, applyReorderAction],
  );

  const handleDragPreviewClear = React.useCallback(() => {
    setPreviewItems(null);
  }, []);

  // Commit a finalized item reorder: clears the during-drag preview,
  // applies the optimistic state (for the server roundtrip), computes
  // the changes payload from the SAME source as the reducer (items
  // props), and persists via reorderItems.
  //
  // Why lift this here instead of keeping it in canvas-with-selection:
  // the changes payload + the useOptimistic reducer must compute from
  // the same state. canvas-with-selection only sees `effectiveItems`
  // (preview-applied), so if it computed `changes` from effective it
  // would diverge from the reducer (which applies to items props).
  // This handler keeps both on the same `items` source and uses the
  // reducer's output for the payload — single source of truth.
  const handleCommitReorder = React.useCallback(
    (action: OptimisticReorderAction) => {
      // Compute the reordered state from ORIGINAL items + action. The
      // reducer's optimistic apply (below) produces the same result, so
      // payload and optimistic stay consistent.
      const reorderedItems = applyReorderAction(items, action);
      const changes = reorderedItems.map((item, idx) => ({
        id: item.id,
        position: idx,
        // Always set category_id on the active item. The reducer's
        // result has the correct category_id (either action.newCategoryId
        // for Case B, or the target slug for Case A); passing it here
        // ensures the server UPDATEs to that value rather than COALESCing
        // to the pre-existing one. Same-category drags effectively re-
        // write the existing value — no-op cost.
        ...(item.id === action.activeId
          ? { category_id: item.category_id }
          : {}),
      }));

      React.startTransition(async () => {
        // Clear preview + dispatch optimistic in the same transition.
        // Both batched into the next render — no flash between
        // preview-cleared and optimistic-applied.
        setPreviewItems(null);
        applyOptimisticReorder(action);

        const result = await reorderItems({
          catalogId,
          catalogSlug,
          changes,
        });

        if (!result.ok) {
          console.error(
            "[LibraryCanvas] reorderItems failed:",
            result.error,
          );
          toast.error(result.error ?? "Couldn't save the new order.");
          return;
        }

        // Sync RSC. Optimistic resolves against the refreshed prop.
        router.refresh();
      });
    },
    [items, applyReorderAction, applyOptimisticReorder, catalogId, catalogSlug, router],
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

  // NOTE: bucketing uses `effectiveItems`, NOT the raw `items` prop.
  // This is the key piece that makes drag feedback feel instant — the
  // rendered category sections see the moved item in its new bucket
  // synchronously (during drag via `previewItems`, during server
  // roundtrip via `optimisticItems`).
  const itemsByCategory = React.useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const cat of sortedCategories) {
      map.set(cat.id, []);
    }
    const orphans: Item[] = [];
    for (const item of effectiveItems) {
      const bucket = map.get(item.category_id);
      if (bucket) {
        bucket.push(item);
      } else {
        orphans.push(item);
      }
    }
    return { map, orphans };
  }, [effectiveItems, sortedCategories]);

  return (
    <main className="w-full">
      <CanvasLocaleProvider locales={locales}>
        <CanvasWithSelection
          catalogId={catalogId}
          catalogSlug={catalogSlug}
          items={effectiveItems}
          categories={sortedCategories}
          translations={translations}
          currencySettings={currencySettings}
          onOptimisticCategoryReorder={applyOptimisticCategoryReorder}
          onDragPreview={handleDragPreview}
          onDragPreviewClear={handleDragPreviewClear}
          onCommitReorder={handleCommitReorder}
        >
          <PageHeader
            categories={sortedCategories}
            locales={locales}
          />
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
              {effectiveItems.length === 0 ? (
                <EmptyCatalog categories={sortedCategories} />
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
                        // KRA-90 added current_source_hash for translation drift detection.
                        // Synthetic orphan bucket isn't a real category so we leave it null.
                        current_source_hash: null,
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
            items={effectiveItems}
            categories={sortedCategories}
            media={media}
            translations={translations}
            orgId={orgId}
            catalogId={catalogId}
            catalogSlug={catalogSlug}
            currencySettings={currencySettings}
          />
        </CanvasWithSelection>
      </CanvasLocaleProvider>
    </main>
  );
}

/**
 * PageHeader — page chrome rendered INSIDE CanvasWithSelection so the
 * "Add item" button can call useCanvasSelection().startCreating().
 * Hosts the page title, locale tab strip, and the create CTA.
 *
 * "Add item" picks the first sorted category as the default for the
 * draft form; the merchant can change it via the Category dropdown
 * inside the editor. Disabled when there are no categories — the
 * EmptyCatalog state handles that path with its own CTA.
 */
function PageHeader({
  categories,
  locales,
}: {
  categories: CatalogCategory[];
  locales: LocaleOption[];
}) {
  const { startCreating } = useCanvasSelection();
  const defaultCategoryId = categories[0]?.id;
  return (
    <div className="w-full border-b">
      <div className="mx-auto flex h-[120px] max-w-[1248px] flex-col justify-center gap-2 px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[32px] font-semibold tracking-tight">Library</h1>
          <Button
            onClick={() => {
              if (defaultCategoryId) startCreating(defaultCategoryId);
            }}
            disabled={!defaultCategoryId}
          >
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
        <LocaleTabStrip locales={locales} />
      </div>
    </div>
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
function EmptyCatalog({ categories }: { categories: CatalogCategory[] }) {
  const { startCreating } = useCanvasSelection();
  const defaultCategoryId = categories[0]?.id;
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
      <Button
        className="mt-6"
        onClick={() => {
          if (defaultCategoryId) startCreating(defaultCategoryId);
        }}
        disabled={!defaultCategoryId}
      >
        <Plus className="size-4" />
        Add your first item
      </Button>
    </div>
  );
}
