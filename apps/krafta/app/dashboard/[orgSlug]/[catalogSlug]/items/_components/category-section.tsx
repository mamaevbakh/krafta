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
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { LibraryRow } from "./library-row";

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
}: CategorySectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `category-${category.id}`,
  });

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
      data-slot="category-section"
      data-category-id={category.id}
      className={cn(
        "scroll-mt-20 transition-colors", // scroll-mt-20 ≈ sticky-header offset
        // Drop zone highlight per design doc Pass-2 / DR2 — subtle accent
        // background when a draggable hovers over this section. Not a bold
        // colored fill (anti-slop) — just `bg-accent/40`.
        isOver && "bg-accent/40 rounded-md -mx-2 px-2 py-2",
      )}
    >
      {/* Section header — collapsible toggle. Whole header is clickable
          (not just the chevron) so merchants don't have to precision-aim. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={`category-${category.id}-content`}
        className={cn(
          "mb-3 flex w-full items-baseline justify-between gap-2 rounded-md py-1",
          "text-left transition-colors hover:bg-accent/30",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          {/* Chevron icon — visual cue. 150ms rotate via icon swap (no CSS
              transform needed; lucide icons swap cleanly). */}
          {collapsed ? (
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-colors"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-colors"
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

      {/* Content — items list. Collapsed sections hide everything (including
          the empty hint), per plan D4.1: collapsed reads as "I don't care
          about this category right now," not "this category is empty." */}
      {!collapsed && (
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div
            id={`category-${category.id}-content`}
            className="flex flex-col gap-2"
          >
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
      )}
    </section>
  );
}
