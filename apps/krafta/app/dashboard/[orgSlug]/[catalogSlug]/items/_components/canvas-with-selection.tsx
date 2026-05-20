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
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  reorderItems,
  type ReorderItemsChange,
} from "@/app/dashboard/[orgSlug]/[catalogSlug]/items/_components/actions";
import type { Item } from "@/lib/catalogs/types";

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
   *  reads this to compute the new positions after a drop. */
  items: Item[];
  /** Optional callback to subscribe to selection changes (e.g. to scroll
   *  the selected card into view). */
  onSelectionChange?: (id: string | null) => void;
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
  onSelectionChange,
  children,
}: CanvasWithSelectionProps) {
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
  // a successful drop. We translate that into a reorderItems RPC call.
  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        // Dropped on itself or outside any droppable. No-op.
        return;
      }

      // Both ids are item ids (we attach useSortable to each item card).
      // Compute new positions: insert active just before/after over in the
      // canonical sort order. The server-side reorder_items RPC takes the
      // resulting (id, position) list and updates atomically.
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

      const result = await reorderItems({
        catalogId,
        catalogSlug,
        changes,
      });

      if (!result.ok) {
        // Surface error via console for now — PR 3 will wire to Sonner toast
        // alongside the rest of the autosave UX.
        console.error("[CanvasWithSelection] reorderItems failed:", result.error);
      }
    },
    [items, catalogId, catalogSlug],
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
