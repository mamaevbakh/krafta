"use client";

/**
 * canvas-with-selection.tsx — selection state + drag context for the Library Canvas.
 *
 * Per /plan-eng-review D4 + ER3: client useState in a canvas-wrapping client
 * component, NOT URL params + NOT parallel routes. Selection is ephemeral
 * (merchants don't share "edit this item" URLs); the simpler pattern wins.
 *
 * Wraps the canvas tree in:
 *   1. CanvasSelectionContext — useState<string | null> for the selected
 *      item id. Reader: Inspector (reads which item to render). Writer:
 *      EditableItemCard's onSelect callback (set on chrome click).
 *   2. dnd-kit DndContext — provides drag-drop primitives to the whole
 *      canvas. Drop handler calls reorderItems RPC (server action).
 *
 * Selection is intentionally ONE item at a time. Multi-select bulk
 * operations are deferred to v1.1 per P4. The Inspector's compound API
 * reads from this context, so any descendant component that needs to
 * react to selection just calls useCanvasSelection().
 *
 * Naming note: this is the wrapper merchant-side editor, not the customer-
 * facing catalog. Selection state has no meaning on the customer side
 * because customers don't select-then-edit; they tap an item and see a
 * detail sheet (different surface, lives in components/catalogs/items/).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";

import {
  reorderCategories,
  reorderItems,
  type ReorderCategoriesChange,
  type ReorderItemsChange,
} from "@/app/dashboard/[orgSlug]/[catalogSlug]/items/_components/actions";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { LibraryRowDragPreview } from "./library-row";

// Shape for the LibraryRowDragPreview's translations array. Kept inline to
// avoid an extra import from one of the consumer files.
type ItemTranslationRow = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

/**
 * Action passed to the parent's useOptimistic reducer. Kept here in
 * sync with `OptimisticReorderAction` in library-canvas.tsx — they're
 * structurally identical and the prop type uses `(action: ...) => void`
 * so TypeScript will catch any drift.
 */
type OptimisticReorderAction = {
  activeId: string;
  overId: string;
  newCategoryId?: string;
};

/** Category-reorder twin of the above. The active/over ids passed to
 *  this reducer are the bare uuids (the dnd-kit ids strip the
 *  `category-` prefix before dispatch). */
type OptimisticCategoryReorderAction = {
  activeId: string;
  overId: string;
};

/** dnd-kit sortable id prefix for category section headers. Item
 *  sortables use the raw item uuid; categories prefix to disambiguate
 *  in the shared handleDragEnd. */
const CATEGORY_ID_PREFIX = "category-";

// =======================================================================
// Selection context
// =======================================================================

type CanvasSelectionValue = {
  /** Item id currently selected. null = no editor visible. */
  selectedItemId: string | null;
  /** Setter. Pass null to deselect (canvas chrome click outside any
   *  card calls this). */
  setSelectedItemId: (id: string | null) => void;
  /** Item id currently pulsing (post-duplicate "find the new clone"
   *  affordance per Iter 2 T4 / Pass 3 D3A). Null = no pulse active.
   *  LibraryRow reads this and applies `animate-row-flash` when matched. */
  pulsingItemId: string | null;
  /** Fire the post-duplicate animation: set pulsingItemId for ~1.2s,
   *  scroll the matching row into view. Called by EditorSheet's
   *  handleDuplicate after duplicate_item succeeds. */
  pulseItem: (id: string) => void;
  /** True while any category section is being dragged (KRA-91 UX
   *  enhancement). CategorySection reads this to force-collapse every
   *  section during the drag — gives the merchant a compact bird's-eye
   *  view of the catalog structure to drop into. Restores to per-
   *  section collapse state on dragEnd / dragCancel. */
  isDraggingCategory: boolean;
};

const CanvasSelectionContext =
  React.createContext<CanvasSelectionValue | null>(null);

export function useCanvasSelection(): CanvasSelectionValue {
  const ctx = React.useContext(CanvasSelectionContext);
  if (!ctx) {
    throw new Error(
      "useCanvasSelection must be used inside <CanvasWithSelection>",
    );
  }
  return ctx;
}

// =======================================================================
// CanvasWithSelection — the wrapper component
// =======================================================================

export type CanvasWithSelectionProps = {
  /** Catalog id — required for the reorderItems RPC. */
  catalogId: string;
  /** Catalog slug — required for revalidation after reorder. */
  catalogSlug: string;
  /** Flat list of items rendered in the canvas. The drag-drop handler
   *  reads this to compute the new positions after a drop.
   *  Note: with optimistic UI (KRA-35 Iter 2 follow-up), this is the
   *  parent's `optimisticItems` — so the handler computes new positions
   *  from the latest visible state, not stale RSC data. */
  items: Item[];
  /** Sorted category list (parent passes optimisticCategories sorted by
   *  position). The handler reads this when a category-prefixed drag
   *  ends to compute new positions. Required even if reorder isn't
   *  wired so the handler doesn't crash on a category drag. */
  categories?: CatalogCategory[];
  /** All item_translations rows — forwarded to the DragOverlay preview
   *  so the floating clone resolves the correct active locale's name. */
  translations?: ItemTranslationRow[];
  /** Currency settings — forwarded to the DragOverlay preview so the
   *  floating clone formats the price identically to the in-place row. */
  currencySettings?: CurrencySettings;
  /** Optional callback to subscribe to selection changes (e.g. to scroll
   *  the selected card into view). */
  onSelectionChange?: (id: string | null) => void;
  /** Called from inside startTransition before the reorderItems server
   *  action so the canvas re-renders synchronously with the moved item
   *  in its new slot. Wired to the parent's useOptimistic dispatcher.
   *  If omitted, drag-drop falls back to the legacy "wait for refresh"
   *  flow with the visible snap-back. */
  onOptimisticReorder?: (action: OptimisticReorderAction) => void;
  /** Same idea, but for category-section drags. KRA-91 — wired to
   *  applyOptimisticCategoryReorder in library-canvas.tsx. */
  onOptimisticCategoryReorder?: (action: OptimisticCategoryReorderAction) => void;
  /** During-drag preview dispatcher. Called from onDragOver each time the
   *  over target changes such that a cross-category move is needed.
   *  library-canvas mutates a plain useState — persists through the
   *  whole drag (unlike useOptimistic's sync transitions which revert
   *  immediately). */
  onDragPreview?: (action: OptimisticReorderAction) => void;
  /** Clears the during-drag preview. Called on dragEnd/dragCancel before
   *  the useOptimistic dispatch takes over for the server roundtrip. */
  onDragPreviewClear?: () => void;
  children: React.ReactNode;
};

/**
 * CanvasWithSelection — wraps the Library Canvas tree.
 *
 * Provides:
 *   - selectedItemId state (via context) — Inspector reads, item cards write
 *   - dnd-kit DndContext — descendants use SortableContext per category +
 *     useSortable per item card
 *   - DragEndEvent → reorderItems RPC dispatch
 *
 * The drop handler is intentionally minimal — it computes the position
 * deltas from dnd-kit's `over` and dispatches reorderItems. The server
 * action revalidates the catalog cache; the next render hydrates with
 * the new order.
 */
export function CanvasWithSelection({
  catalogId,
  catalogSlug,
  items,
  categories,
  translations,
  currencySettings,
  onSelectionChange,
  onOptimisticReorder,
  onOptimisticCategoryReorder,
  onDragPreview,
  onDragPreviewClear,
  children,
}: CanvasWithSelectionProps) {
  const router = useRouter();
  const [selectedItemId, setSelectedItemIdState] = React.useState<
    string | null
  >(null);

  const setSelectedItemId = React.useCallback(
    (id: string | null) => {
      setSelectedItemIdState(id);
      onSelectionChange?.(id);
    },
    [onSelectionChange],
  );

  // Iter 2 T4: post-duplicate pulse coordination. EditorSheet's
  // handleDuplicate calls pulseItem(newId) after duplicate_item resolves.
  // The state is set immediately so LibraryRow can apply the
  // animate-row-flash class; the scroll-into-view fires on a short delay
  // to let router.refresh()'s new items prop mount the new <LibraryRow>.
  // Auto-clears after 1200ms so the merchant doesn't see a stuck flash.
  const [pulsingItemId, setPulsingItemIdState] = React.useState<
    string | null
  >(null);
  const pulseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const pulseItem = React.useCallback((id: string) => {
    setPulsingItemIdState(id);

    // Clear any pre-existing timers (back-to-back duplicates shouldn't
    // queue stale clears or scroll attempts).
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    // 100ms delay before scrolling — gives router.refresh() time to land
    // the new item in the DOM. If the row isn't there yet (slow network),
    // the scroll is a no-op; degradation is graceful.
    scrollTimeoutRef.current = setTimeout(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-row-item-id="${id}"]`,
      );
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    // Clear the pulse class after the animation duration. Per D7 motion
    // budget: 1200ms ease-out for the "Saved ✓" / "Duplicated" flashes.
    pulseTimeoutRef.current = setTimeout(() => {
      setPulsingItemIdState(null);
    }, 1200);
  }, []);

  // Cleanup on unmount: clear any pending timers so they don't fire after
  // the component is gone.
  React.useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // KRA-91 UX — auto-collapse all category sections during a category
  // drag. Toggled by onDragStart / onDragEnd / onDragCancel below;
  // CategorySection reads this via useCanvasSelection() and renders
  // collapsed regardless of its own state for the duration of the drag.
  const [isDraggingCategory, setIsDraggingCategory] = React.useState(false);

  // Active drag tracking — feeds the DragOverlay (renders the floating
  // clone) and the cross-category preview logic. null when no drag is
  // in progress.
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    const activeIdStr = String(event.active.id);
    setActiveDragId(activeIdStr);
    if (activeIdStr.startsWith(CATEGORY_ID_PREFIX)) {
      setIsDraggingCategory(true);
    }
  }, []);

  const handleDragCancel = React.useCallback(() => {
    setIsDraggingCategory(false);
    setActiveDragId(null);
    onDragPreviewClear?.();
  }, [onDragPreviewClear]);

  // Live cross-category preview. Fires every time the over target
  // changes — when the merchant drags an item across a category
  // boundary, we mutate the parent's `previewItems` state via
  // onDragPreview so the target section's SortableContext immediately
  // re-renders with the active item appended to it.
  //
  // Same-category moves are skipped here — the inner SortableContext
  // handles those natively via verticalListSortingStrategy. Dispatching
  // on every same-category over-target change would be O(n) thrash per
  // item-to-item transition for no visual gain.
  //
  // Why we don't use useOptimistic here: useOptimistic only persists
  // optimistic state DURING an open transition. A sync startTransition
  // (one tick) reverts the state immediately on next render — merchant
  // sees zero preview effect. The parent uses plain useState for the
  // during-drag preview, which persists for the whole drag.
  const handleDragOver = React.useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      // Skip category-section drags entirely — those reorder categories,
      // not items, so cross-list reflow doesn't apply.
      if (activeIdStr.startsWith(CATEGORY_ID_PREFIX)) return;

      const activeItem = items.find((i) => i.id === activeIdStr);
      if (!activeItem) return;

      // Where is `over`? Two cases:
      //   1. over is another item — read its category_id directly.
      //   2. over is a section root (collapsed or just the empty area
      //      below the last item) — strip the `category-` prefix.
      let targetCategoryId: string | null = null;
      if (overIdStr.startsWith(CATEGORY_ID_PREFIX)) {
        targetCategoryId = overIdStr.slice(CATEGORY_ID_PREFIX.length);
      } else {
        const overItem = items.find((i) => i.id === overIdStr);
        if (overItem) targetCategoryId = overItem.category_id;
      }
      if (!targetCategoryId) return;

      // Skip when active is already in the target category (`items` here
      // is the parent's effectiveItems, so this reflects the preview-
      // applied layout). Inner SortableContext handles within-category
      // reflow from here.
      if (activeItem.category_id === targetCategoryId) return;

      // Cross-category transition: persist the preview move in the
      // parent's previewItems state. The visual update happens on the
      // next render; dnd-kit picks up the new layout and continues
      // tracking the drag against the active in its new category.
      onDragPreview?.({
        activeId: activeIdStr,
        overId: overIdStr,
        newCategoryId: targetCategoryId,
      });
    },
    [items, onDragPreview],
  );

  // Sensor tuning (KRA-35 Iter 2 / Pass 6 D4B: whole-row drag, single tap
  // opens editor):
  //
  //   PointerSensor (desktop): activation requires 8px drag distance. A
  //   plain click (no movement) doesn't start a drag — the row's onClick
  //   fires instead and opens the editor.
  //
  //   TouchSensor (mobile): activation requires a 250ms long-press OR 5px
  //   movement. A quick tap releases before 250ms and below 5px → onClick
  //   fires → editor opens. A held finger → drag activates. The 5px
  //   tolerance allows for minor finger jitter during the press without
  //   accidentally activating drag on what was meant as a tap.
  //
  // Per Iter 2 design plan §3 D4B + the LibraryRow's `touchAction: "none"`
  // style which prevents the browser's native scroll from fighting the
  // long-press detection.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  // Drag-end handler. dnd-kit fires this with the over-target's data on
  // a successful drop.
  //
  // Optimistic flow (KRA-35 Iter 2 follow-up):
  //   1. Compute new positions + cross-category target from the drop.
  //   2. Inside startTransition: dispatch onOptimisticReorder so the parent's
  //      useOptimistic state immediately reflects the new order. UI re-
  //      renders synchronously — no snap-back.
  //   3. Inside the same transition: await reorderItems server action.
  //      React keeps the optimistic state visible for the duration.
  //   4. On success: router.refresh() re-fetches the RSC data with the new
  //      canonical order. The optimistic state syncs to the refreshed prop
  //      seamlessly (same order, no visual change).
  //   5. On failure: toast.error + return. The transition completes without
  //      a parent prop change, so React auto-reverts the optimistic state
  //      to the original `items` prop. Merchant sees the row snap back +
  //      a clear error.
  //
  // If no onOptimisticReorder is provided we fall back to the legacy
  // "wait for refresh" flow (used in tests or non-canvas contexts).
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      // Reset all transient drag state immediately so:
      //  - the DragOverlay clone disappears,
      //  - the category re-expand animation starts the moment the
      //    merchant releases.
      // Async work (server call + refresh) runs in parallel below.
      setIsDraggingCategory(false);
      setActiveDragId(null);

      const { active, over } = event;
      if (!over || active.id === over.id) {
        // Dropped on itself or outside any droppable. No-op.
        return;
      }

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      // KRA-91 — category-section drag. ids look like `category-<uuid>`.
      // Route to the category-reorder branch and short-circuit before the
      // items path runs.
      if (activeIdStr.startsWith(CATEGORY_ID_PREFIX)) {
        // Defensive: ignore mismatched over (e.g. category dropped on an
        // item id by some misconfiguration).
        if (!overIdStr.startsWith(CATEGORY_ID_PREFIX)) return;
        if (!categories || categories.length === 0) return;

        const activeCategoryId = activeIdStr.slice(CATEGORY_ID_PREFIX.length);
        const overCategoryId = overIdStr.slice(CATEGORY_ID_PREFIX.length);

        const sortedCategories = [...categories].sort(
          (a, b) => a.position - b.position,
        );
        const activeIdx = sortedCategories.findIndex(
          (c) => c.id === activeCategoryId,
        );
        const overIdx = sortedCategories.findIndex(
          (c) => c.id === overCategoryId,
        );
        if (activeIdx < 0 || overIdx < 0) return;

        const [movedCategory] = sortedCategories.splice(activeIdx, 1);
        sortedCategories.splice(overIdx, 0, movedCategory);
        const categoryChanges: ReorderCategoriesChange[] =
          sortedCategories.map((c, idx) => ({ id: c.id, position: idx }));

        React.startTransition(async () => {
          onOptimisticCategoryReorder?.({
            activeId: activeCategoryId,
            overId: overCategoryId,
          });

          const result = await reorderCategories({
            catalogId,
            catalogSlug,
            changes: categoryChanges,
          });

          if (!result.ok) {
            console.error(
              "[CanvasWithSelection] reorderCategories failed:",
              result.error,
            );
            toast.error(result.error ?? "Couldn't save the new category order.");
            return;
          }

          router.refresh();
        });
        return;
      }

      // Items branch — active is an item uuid (we attach useSortable to
      // each row with `item.id` as the sortable id).
      const activeItem = items.find((i) => i.id === active.id);
      if (!activeItem) return;

      const sortedItems = [...items].sort((a, b) => a.position - b.position);
      const activeIdx = sortedItems.findIndex((item) => item.id === active.id);
      if (activeIdx < 0) return;

      // Two over-target shapes:
      //  A. Another item — move active to that item's slot.
      //  B. A category section root (over.id starts with `category-`) —
      //     typically dropping into a collapsed section. Append active
      //     to the end of that category.
      let reorderedItems: Item[];
      let crossCategory: string | undefined;

      if (overIdStr.startsWith(CATEGORY_ID_PREFIX)) {
        const targetCategoryId = overIdStr.slice(CATEGORY_ID_PREFIX.length);
        // If we're already in this category (e.g. dropped on own section
        // root after a no-op move), bail.
        if (activeItem.category_id === targetCategoryId) return;
        crossCategory = targetCategoryId;
        // Splice out active, then insert just after the last item in target.
        const withoutActive = [...sortedItems];
        withoutActive.splice(activeIdx, 1);
        let insertAt = withoutActive.length;
        for (let i = withoutActive.length - 1; i >= 0; i--) {
          if (withoutActive[i].category_id === targetCategoryId) {
            insertAt = i + 1;
            break;
          }
        }
        const movedWithNewCategory: Item = {
          ...activeItem,
          category_id: targetCategoryId,
        };
        withoutActive.splice(insertAt, 0, movedWithNewCategory);
        reorderedItems = withoutActive;
      } else {
        const overIdx = sortedItems.findIndex((item) => item.id === over.id);
        if (overIdx < 0) return;
        const overItem = sortedItems[overIdx];
        crossCategory =
          activeItem.category_id !== overItem.category_id
            ? overItem.category_id
            : undefined;
        // arrayMove is dnd-kit's canonical move helper — equivalent to
        // splice(activeIdx, 1) + splice(overIdx, 0, moved) but more
        // explicit about intent and consistent with the rest of the
        // library's semantics.
        reorderedItems = arrayMove(sortedItems, activeIdx, overIdx);
      }

      // Build the changes payload from the reordered list. We send all
      // items with their new positions — for a 30-item menu that's 30
      // UPDATEs vs maybe 5; both fast. The RPC's COALESCE on category_id
      // preserves it when omitted.
      const changes: ReorderItemsChange[] = reorderedItems.map((item, idx) => ({
        id: item.id,
        position: idx,
        ...(item.id === active.id && crossCategory
          ? { category_id: crossCategory }
          : {}),
      }));

      const action: OptimisticReorderAction = {
        activeId: String(active.id),
        overId: String(over.id),
        newCategoryId: crossCategory,
      };

      // Wrap the optimistic dispatch + async server call in a single
      // transition:
      //   1. Clear the during-drag preview (parent's previewItems = null).
      //      effective falls back to optimisticItems for the rest of the
      //      roundtrip.
      //   2. Apply optimistic — keeps the new layout visible during the
      //      await reorderItems.
      //   3. await the server call.
      //   4. Success: router.refresh syncs items prop → optimistic syncs
      //      → effective syncs. Failure: transition completes without a
      //      matching prop change → optimistic auto-reverts to items →
      //      effective falls back to items → row snaps back to original.
      // All three setState calls inside startTransition's callback are
      // batched into one render, so the merchant doesn't see a flash
      // between "preview cleared" and "optimistic applied".
      React.startTransition(async () => {
        onDragPreviewClear?.();
        onOptimisticReorder?.(action);

        const result = await reorderItems({
          catalogId,
          catalogSlug,
          changes,
        });

        if (!result.ok) {
          console.error(
            "[CanvasWithSelection] reorderItems failed:",
            result.error,
          );
          toast.error(result.error ?? "Couldn't save the new order.");
          return;
        }

        // Refresh RSC so the items prop catches up with the canonical
        // (now persisted) order. useOptimistic resolves the transition
        // against the new prop value seamlessly.
        router.refresh();
      });
    },
    [
      items,
      categories,
      catalogId,
      catalogSlug,
      onOptimisticReorder,
      onOptimisticCategoryReorder,
      onDragPreviewClear,
      router,
    ],
  );

  const selectionValue = React.useMemo(
    () => ({
      selectedItemId,
      setSelectedItemId,
      pulsingItemId,
      pulseItem,
      isDraggingCategory,
    }),
    [
      selectedItemId,
      setSelectedItemId,
      pulsingItemId,
      pulseItem,
      isDraggingCategory,
    ],
  );

  // Compute the active row's data for the DragOverlay clone. Looking up
  // by id rather than threading state — items[] is the source of truth
  // and matches what the in-place row would render.
  const activeItemForOverlay = React.useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith(CATEGORY_ID_PREFIX)) return null;
    return items.find((i) => i.id === activeDragId) ?? null;
  }, [activeDragId, items]);

  const activeCategoryForOverlay = React.useMemo(() => {
    if (!activeDragId) return null;
    if (!activeDragId.startsWith(CATEGORY_ID_PREFIX)) return null;
    const categoryId = activeDragId.slice(CATEGORY_ID_PREFIX.length);
    return categories?.find((c) => c.id === categoryId) ?? null;
  }, [activeDragId, categories]);

  return (
    <CanvasSelectionContext.Provider value={selectionValue}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}

        {/* DragOverlay renders a free-floating clone that follows the
            cursor at full opacity (the in-place row has opacity:0 while
            dragging, leaving an empty slot). This is the standard
            "lifted card" pattern in dnd-kit and feels far more natural
            than the prior 50%-opacity in-place ghost. */}
        <DragOverlay dropAnimation={null}>
          {activeItemForOverlay && translations && currencySettings ? (
            <LibraryRowDragPreview
              item={activeItemForOverlay}
              translations={translations}
              currencySettings={currencySettings}
            />
          ) : activeCategoryForOverlay ? (
            <CategoryHeaderDragPreview
              name={activeCategoryForOverlay.name}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </CanvasSelectionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// CategoryHeaderDragPreview — minimal floating clone of a category header
// for the DragOverlay. Just the grip + name + a hint that this is a
// category being moved. Mirrors the in-place header chrome enough that
// the merchant recognizes what they're carrying.
// ---------------------------------------------------------------------------
function CategoryHeaderDragPreview({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-lg ring-1 ring-ring/30">
      <span className="text-base font-semibold tracking-tight">{name}</span>
    </div>
  );
}
