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
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";

import {
  reorderCategories,
  reorderItems,
  type ReorderCategoriesChange,
  type ReorderItemsChange,
} from "@/app/dashboard/[orgSlug]/[catalogSlug]/items/_components/actions";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";

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
  onSelectionChange,
  onOptimisticReorder,
  onOptimisticCategoryReorder,
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

      // Items branch — original behavior. Both ids are item uuids; we
      // attach useSortable to each item card with `item.id` as the
      // sortable id. Compute new positions: insert active just before/
      // after over in the canonical sort order.
      const sortedItems = [...items].sort((a, b) => a.position - b.position);
      const activeIdx = sortedItems.findIndex((item) => item.id === active.id);
      const overIdx = sortedItems.findIndex((item) => item.id === over.id);
      if (activeIdx < 0 || overIdx < 0) return;

      // Remove active and re-insert at overIdx.
      const [moved] = sortedItems.splice(activeIdx, 1);
      sortedItems.splice(overIdx, 0, moved);

      // Determine cross-category drag: if the over item's category differs
      // from the active item's, we also update category_id.
      const activeItem = items.find((i) => i.id === active.id);
      const overItem = items.find((i) => i.id === over.id);
      const crossCategory =
        activeItem &&
        overItem &&
        activeItem.category_id !== overItem.category_id
          ? overItem.category_id
          : undefined;

      // Build the changes payload. We only include items whose position
      // changed to keep the payload small — but easier and equally correct
      // to send all of them with their new positions; the server will UPDATE
      // them with values they already have (no-op for unchanged rows). For
      // a 30-item menu that's 30 UPDATEs vs maybe 5; both fast.
      const changes: ReorderItemsChange[] = sortedItems.map((item, idx) => ({
        id: item.id,
        position: idx,
        // Only set category_id on the moved item for cross-category drag.
        // Other items keep their existing category — leaving category_id
        // omitted means the RPC preserves it (COALESCE in the function).
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
      // transition. React renders the optimistic state for the entire
      // duration; once the transition resolves the optimistic state
      // syncs to the latest props (success: refreshed RSC data; failure:
      // unchanged original items).
      React.startTransition(async () => {
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
      router,
    ],
  );

  const selectionValue = React.useMemo(
    () => ({ selectedItemId, setSelectedItemId, pulsingItemId, pulseItem }),
    [selectedItemId, setSelectedItemId, pulsingItemId, pulseItem],
  );

  return (
    <CanvasSelectionContext.Provider value={selectionValue}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {children}
      </DndContext>
    </CanvasSelectionContext.Provider>
  );
}
