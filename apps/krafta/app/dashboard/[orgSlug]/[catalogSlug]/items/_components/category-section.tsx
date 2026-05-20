"use client";

/**
 * category-section.tsx — one category's rendering on the Library Canvas.
 *
 * Per Iter 2 redesign: the section renders compact LibraryRow items
 * instead of the prior EditableItemCard. Iter 2 walked back KRA-35 v1's
 * inline-edit-on-canvas model (Pass 2 D2C) — rows are now click-to-open
 * targets, not inline-edit surfaces.
 *
 * Section header is intentionally minimal in iter 2 T1 (this PR):
 *   - Category name (read-only display)
 *   - Item count (visible hint at section scale)
 *
 * Collapsible chevron + add-item shortcut + section-level reorder land in
 * iter 2 T3 (KRA-88).
 */

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

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
};

/**
 * CategorySection — section header + sortable list of LibraryRow items.
 *
 * Iter 2 T1 keeps the props lean: no catalogId / catalogSlug needed because
 * rows are click-to-open (selection only, no server calls from here). T3
 * (collapsible + per-section "Add item to this category") will re-add them
 * when it lands.
 */
export function CategorySection({
  category,
  items,
  translations,
  currencySettings,
}: CategorySectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `category-${category.id}`,
  });

  const sortedItems = React.useMemo(
    () => [...items].sort((a, b) => a.position - b.position),
    [items],
  );

  // Map item ids in order for SortableContext.
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
        "scroll-mt-4 transition-colors",
        // Drop zone highlight per design doc Pass-2 / DR2 — subtle accent
        // background when a draggable hovers over this section. Not a bold
        // colored fill (anti-slop) — just `bg-accent/40`.
        isOver && "bg-accent/40 rounded-md -mx-2 px-2 py-2",
      )}
    >
      {/* Section header — minimal in iter 2 T1. T3 adds chevron collapse
          toggle + add-item-to-this-category button. */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {category.name}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Items list — SortableContext per section. Vertical strategy because
          our rows stack vertically inside each category. Cross-category drag
          is handled by the parent DndContext (see canvas-with-selection.tsx). */}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
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
    </section>
  );
}
