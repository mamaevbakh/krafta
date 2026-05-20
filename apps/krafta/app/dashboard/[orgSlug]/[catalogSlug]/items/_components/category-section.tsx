"use client";

/**
 * category-section.tsx — one category's rendering on the Library Canvas.
 *
 * Per the KRA-35 design doc Approach B: categories render as section
 * headers in the canvas, with their items as cards beneath. This is the
 * unit. The parent LibraryCanvas maps catalog categories → CategorySection
 * → SortableContext (dnd-kit) per category.
 *
 * Section header is intentionally minimal in PR 2:
 *   - Category name (read-only display — PR 3 can wire InlineText here
 *     once the category rename action exists in scope)
 *   - Item count (visible hint at section scale)
 *
 * The drag-handle, "Add item to this category" affordance, collapse/expand,
 * and category-level reorder are deferred to PR 3 or follow-ups so PR 2
 * stays focused on the item-level canvas + inspector.
 *
 * Items inside the section: each EditableItemCard wired with save callbacks
 * built from updateItem (existing server action). Save callbacks capture
 * the current item snapshot so partial edits don't lose other fields.
 */

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { EditableItemCard } from "@/components/catalogs/cards/card-default-editable";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { cn } from "@/lib/utils";

import { useCanvasSelection } from "./canvas-with-selection";
import { updateItem, type ItemTranslationInput } from "./actions";

export type CategorySectionProps = {
  category: CatalogCategory;
  /** Items belonging to this category. Caller filters by category_id. */
  items: Item[];
  catalogId: string;
  catalogSlug: string;
  currencySettings: CurrencySettings;
};

/**
 * SortableItemCard — wraps EditableItemCard with dnd-kit sortable.
 *
 * Why an inner component: useSortable is a hook, and it needs to be called
 * per item card to register that card as draggable. Wrapping in a parent
 * component keeps EditableItemCard pure (it doesn't know about dnd-kit;
 * caller composes the drag behavior on top).
 */
function SortableItemCard({
  item,
  currencySettings,
  catalogId,
  catalogSlug,
}: {
  item: Item;
  currencySettings: CurrencySettings;
  catalogId: string;
  catalogSlug: string;
}) {
  // Use the legacy `items.image_path` for the canvas thumbnail. The
  // multi-image `item_media` table is the inspector's domain (photo
  // manager in PR 3 / follow-up); the canvas uses one primary image per
  // card just like the customer view does.
  const imageUrl = React.useMemo(() => getItemImageUrl(item), [item]);
  const { selectedItemId, setSelectedItemId } = useCanvasSelection();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  // Build save callbacks per field. Each one calls updateItem with the
  // full current snapshot + the changed field. updateItem rebuilds the
  // canonical row each call; the schema's UPDATE statements are idempotent
  // for unchanged fields. This is the simplest wiring for PR 2; a lighter
  // updateItemField helper can replace these in PR 3 if the round-trip
  // becomes noticeable in production.
  const saveName = React.useCallback(
    async (next: string) => {
      // Pull current translations into the call for upsert correctness.
      // The Item type doesn't carry translations directly; for PR 2 we
      // pass an empty array, which means non-default-locale translations
      // are preserved by updateItem's "update existing, insert new" logic.
      // PR 3 lifts translations into a shape the canvas can hand back here
      // when the locale tab strip is wired.
      const result = await updateItem({
        catalogId,
        catalogSlug,
        itemId: item.id,
        categoryId: item.category_id,
        productType: item.product_type,
        name: next,
        priceCents: item.price_cents,
        description: item.description,
        imageAlt: item.image_alt,
        translations: [] as ItemTranslationInput[],
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Failed to save name");
      }
    },
    [item, catalogId, catalogSlug],
  );

  const saveDescription = React.useCallback(
    async (next: string) => {
      const result = await updateItem({
        catalogId,
        catalogSlug,
        itemId: item.id,
        categoryId: item.category_id,
        productType: item.product_type,
        name: item.name,
        priceCents: item.price_cents,
        description: next || null,
        imageAlt: item.image_alt,
        translations: [] as ItemTranslationInput[],
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Failed to save description");
      }
    },
    [item, catalogId, catalogSlug],
  );

  const savePrice = React.useCallback(
    async (nextCents: number) => {
      const result = await updateItem({
        catalogId,
        catalogSlug,
        itemId: item.id,
        categoryId: item.category_id,
        productType: item.product_type,
        name: item.name,
        priceCents: nextCents,
        description: item.description,
        imageAlt: item.image_alt,
        translations: [] as ItemTranslationInput[],
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Failed to save price");
      }
    },
    [item, catalogId, catalogSlug],
  );

  // Item shape from the page-level query embeds price via item_variations
  // join — the EditableItemCard expects a flat price_cents field per the
  // PublicItem / ItemCardProps shape. The PublicItem type also requires a
  // modifier_lists array; CardMarkup doesn't actually use it for rendering
  // (only Inspector does, via a separate query), so we satisfy the type
  // with an empty array. PR 3 / inspector wiring fetches the real lists
  // when the merchant selects an item.
  const cardItem = {
    id: item.id,
    slug: item.slug,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    image_path: item.image_path,
    image_alt: item.image_alt,
    position: item.position,
    price_cents: item.price_cents,
    modifier_lists: [],
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <EditableItemCard
        item={cardItem}
        imageUrl={imageUrl}
        currencySettings={currencySettings}
        selected={selectedItemId === item.id}
        onSelect={setSelectedItemId}
        saveName={saveName}
        saveDescription={saveDescription}
        savePrice={savePrice}
      />
    </div>
  );
}

/**
 * CategorySection — section header + sortable list of item cards.
 */
export function CategorySection({
  category,
  items,
  catalogId,
  catalogSlug,
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
      {/* Section header — minimal in PR 2. PR 3 can add drag handle,
          add-item button, collapse toggle. */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {category.name}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Items list — SortableContext per section. dnd-kit lets us drag
          across sections (the parent DndContext handles cross-category
          drops) but within-section reorder uses vertical strategy. */}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {sortedItems.length === 0 ? (
            <div className="rounded-xs border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No items in {category.name} yet
            </div>
          ) : (
            sortedItems.map((item) => (
              <SortableItemCard
                key={item.id}
                item={item}
                currencySettings={currencySettings}
                catalogId={catalogId}
                catalogSlug={catalogSlug}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}
