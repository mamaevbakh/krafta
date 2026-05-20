"use client";

/**
 * category-section.tsx — one category's rendering on the Library Canvas.
 *
 * Iter 2 T3: section is now collapsible. Chevron in the header toggles;
 * collapse state persists per (catalog, category) in localStorage. Empty
 * sections still render their dashed hint when expanded, hidden when
 * collapsed (per design plan §3 D4.1).
 *
 * Section header layout (iter 2 T3):
 *   [ChevronRight/Down] [Category name] [item count]
 *
 * Click anywhere on the header → toggle. The chevron icon is the visual
 * cue; the whole header is the click target so merchants don't have to
 * precision-aim at a 16px icon.
 *
 * The empty hint for sections with zero items is rendered only when
 * expanded — if collapsed, the section reads as "header only," which is
 * the right affordance: "this category exists but I don't care about it
 * right now."
 */

import * as React from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";

import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { LibraryRow } from "./library-row";
import { useCanvasSelection } from "./canvas-with-selection";

type ItemTranslation = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

export type CategorySectionProps = {
  category: CatalogCategory;
  /** Items belonging to this category. Caller filters by category_id. */
  items: Item[];
  /** All item_translations rows (loaded at page level). Forwarded to each
   *  LibraryRow which filters per-item internally. */
  translations: ItemTranslation[];
  currencySettings: CurrencySettings;
  /** Catalog id — used as the localStorage key namespace for collapse
   *  state. Each (catalog, category) gets its own persisted state. */
  catalogId: string;
  /** When false, the section's drag affordance is disabled. The synthetic
   *  "Uncategorized" orphans bucket passes false because it has no DB
   *  row to reorder. Default true. */
  sortable?: boolean;
};

const COLLAPSE_STORAGE_KEY = (catalogId: string) =>
  `krafta.library.categoryCollapse.${catalogId}`;

/**
 * Read the collapsed state for a category from localStorage. Returns
 * false on miss or any localStorage error (private mode, quota, JSON
 * parse failure). Default = expanded per Pass 7 OQ3 resolution.
 */
function readCollapsedState(catalogId: string, categoryId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY(catalogId));
    if (!stored) return false;
    const parsed = JSON.parse(stored) as Record<string, boolean>;
    return !!parsed[categoryId];
  } catch {
    return false;
  }
}

/**
 * Write the collapsed state for a category to localStorage. Reads the
 * current map, updates one key, writes back. Race conditions between
 * sections toggling simultaneously are theoretically possible but
 * vanishingly unlikely (merchants click one chevron at a time).
 */
function writeCollapsedState(
  catalogId: string,
  categoryId: string,
  collapsed: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = COLLAPSE_STORAGE_KEY(catalogId);
    const stored = window.localStorage.getItem(key);
    const parsed = (stored ? JSON.parse(stored) : {}) as Record<string, boolean>;
    parsed[categoryId] = collapsed;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // localStorage unavailable (private mode, quota, etc.). Silent.
    // The merchant's collapse state just won't persist across reloads.
  }
}

/**
 * CategorySection — section header + sortable list of LibraryRow items.
 */
export function CategorySection({
  category,
  items,
  translations,
  currencySettings,
  catalogId,
  sortable = true,
}: CategorySectionProps) {
  // useSortable doubles as droppable, so cross-category item drag still
  // resolves to a section root drop. `disabled: !sortable` lets the
  // orphans bucket render with the same component without participating
  // in the SortableContext.
  const {
    setNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `category-${category.id}`,
    disabled: !sortable,
  });

  // KRA-91 UX — collapse every section while ANY category is being
  // dragged. The merchant sees just the header rows during the drag, so
  // it's clear where to drop. On dragEnd / dragCancel, isDraggingCategory
  // resets and each section re-expands to its own persisted state via
  // the grid-rows transition below.
  const { isDraggingCategory } = useCanvasSelection();

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // SSR-safe collapse state. First render is always expanded (matches
  // server output), then useEffect reads localStorage and may flip to
  // collapsed. Brief flash on first paint is acceptable — preference, not
  // data — and prevents hydration mismatch.
  const [collapsed, setCollapsedState] = React.useState(false);

  React.useEffect(() => {
    setCollapsedState(readCollapsedState(catalogId, category.id));
  }, [catalogId, category.id]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsedState((current) => {
      const next = !current;
      writeCollapsedState(catalogId, category.id, next);
      return next;
    });
  }, [catalogId, category.id]);

  // What the section actually renders as collapsed/expanded. The user's
  // own collapse toggle drives `collapsed`; an active category drag
  // overrides every section to collapsed regardless. Both the chevron
  // icon and aria-expanded reflect this so the visual matches a11y.
  const effectiveCollapsed = collapsed || isDraggingCategory;

  const sortedItems = React.useMemo(
    () => [...items].sort((a, b) => a.position - b.position),
    [items],
  );

  const itemIds = React.useMemo(
    () => sortedItems.map((item) => item.id),
    [sortedItems],
  );

  return (
    <section
      ref={setNodeRef}
      {...attributes}
      style={sortableStyle}
      data-slot="category-section"
      data-category-id={category.id}
      className={cn(
        "scroll-mt-20 transition-colors", // scroll-mt-20 ≈ sticky-header offset
        // Drop zone highlight per design doc Pass-2 / DR2 — subtle accent
        // background when a draggable hovers over this section. Not a bold
        // colored fill (anti-slop) — just `bg-accent/40`.
        isOver && "bg-accent/40 rounded-md -mx-2 px-2 py-2",
        // While THIS section is being dragged: a soft shadow indicates the
        // category is in-flight. Functional shadow per DESIGN.md (not
        // decorative). Other sections receive transform/transition from
        // dnd-kit via the sortableStyle above.
        isDragging && "shadow-md",
      )}
    >
      {/* KRA-91 section header — three regions:
            1. Drag handle (GripVertical, drag-only via useSortable listeners)
            2. Collapse toggle (chevron + name + count, click to toggle)
          Nesting two buttons is not allowed in HTML; they're siblings inside
          a flex row instead. The drag handle is only rendered when
          `sortable=true` so the orphans bucket header reads as static.
          No mb-3 — the spacing below the header now lives INSIDE the
          collapsible content (pt-3) so it collapses with the content
          when the section closes. */}
      <div className="flex w-full items-stretch gap-1">
        {sortable && (
          <button
            type="button"
            {...listeners}
            aria-label={`Drag ${category.name} to reorder`}
            className={cn(
              "group/grip flex shrink-0 items-center justify-center",
              "size-9 rounded-md text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "cursor-grab active:cursor-grabbing touch-none",
            )}
          >
            <GripVertical className="size-4" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!effectiveCollapsed}
          aria-controls={`category-${category.id}-content`}
          className={cn(
            "flex flex-1 items-baseline justify-between gap-2 rounded-md py-1 px-2",
            "text-left transition-colors hover:bg-accent/30",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        >
          <div className="flex items-baseline gap-2 min-w-0">
            {effectiveCollapsed ? (
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform"
                aria-hidden="true"
              />
            )}
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {category.name}
            </h2>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </button>
      </div>

      {/* Content — items list. Smooth collapse via the CSS grid-rows
          trick: animate `grid-template-rows` between 1fr (full height)
          and 0fr (zero height) with `overflow-hidden` on the inner cell
          clipping content during the transition. No JS height
          measurement, no primitive needed, GPU-accelerated.
          Per DESIGN.md motion budget: 200ms ease-out for collapse-style
          state changes. The pt-3 padding lives INSIDE the collapsible
          area so the spacing collapses with the content (header sits
          flush against the next section when collapsed). */}
      <div
        id={`category-${category.id}-content`}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          effectiveCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
        aria-hidden={effectiveCollapsed}
      >
        <div className="overflow-hidden">
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2 pt-3">
              {sortedItems.length === 0 ? (
                <div className="rounded-xs border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  No items in {category.name} yet
                </div>
              ) : (
                sortedItems.map((item) => (
                  <LibraryRow
                    key={item.id}
                    item={item}
                    translations={translations}
                    currencySettings={currencySettings}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </div>
      </div>
    </section>
  );
}
