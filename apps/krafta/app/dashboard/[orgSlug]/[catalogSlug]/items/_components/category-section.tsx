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
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { cn } from "@/lib/utils";

import { useCanvasSelection } from "./canvas-with-selection";
import { useCanvasLocale } from "./locale-context";
import { updateItemField, updateDefaultVariationPrice } from "./actions";

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
  /** All item_translations rows (loaded at page level). Filtered per item
   *  inside SortableItemCard so the locale-aware save can resolve the
   *  right row + per-field fallback. */
  translations: ItemTranslation[];
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
  translations,
  currencySettings,
  catalogId,
  catalogSlug,
}: {
  item: Item;
  translations: ItemTranslation[];
  currencySettings: CurrencySettings;
  catalogId: string;
  catalogSlug: string;
}) {
  const { selectedItemId, setSelectedItemId } = useCanvasSelection();
  const { activeLocale, defaultLocale } = useCanvasLocale();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  // Use the legacy `items.image_path` for the canvas thumbnail. The
  // multi-image `item_media` table is the inspector's domain.
  const imageUrl = React.useMemo(() => getItemImageUrl(item), [item]);

  // Resolve per-field display values via the i18n fallback helper. When
  // the active locale lacks a translation row, falls back to the default-
  // locale canonical with isFallback=true. EditableItemCard doesn't
  // currently surface the isFallback flag visually (italic styling is a
  // PR 4 polish), but resolving here means non-default tabs render the
  // translated value when one exists.
  const itemDefaults = React.useMemo(
    () => ({
      name: item.name,
      description: item.description,
      image_alt: item.image_alt,
    }),
    [item.name, item.description, item.image_alt],
  );

  const itemTranslations = React.useMemo(
    () => translations.filter((t) => t.item_id === item.id),
    [translations, item.id],
  );

  const nameField = pickLocalizedField({
    translations: itemTranslations,
    defaults: itemDefaults,
    activeLocale,
    defaultLocale,
    field: "name",
  });
  const descriptionField = pickLocalizedField({
    translations: itemTranslations,
    defaults: itemDefaults,
    activeLocale,
    defaultLocale,
    field: "description",
  });

  // Save callbacks route through the locale-aware updateItemField helper
  // (PR 3 / ER5). The router decides whether to write to items.* (default
  // locale) or item_translations.* (non-default locale). Price has no
  // locale concept — UZS values are not translated — so savePrice uses
  // updateDefaultVariationPrice directly.
  const saveName = React.useCallback(
    async (next: string) => {
      const result = await updateItemField({
        catalogId,
        catalogSlug,
        itemId: item.id,
        activeLocale,
        defaultLocale,
        field: "name",
        value: next,
        fallbackName: item.name,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Failed to save name");
      }
    },
    [item.id, item.name, catalogId, catalogSlug, activeLocale, defaultLocale],
  );

  const saveDescription = React.useCallback(
    async (next: string) => {
      const result = await updateItemField({
        catalogId,
        catalogSlug,
        itemId: item.id,
        activeLocale,
        defaultLocale,
        field: "description",
        value: next || null,
        fallbackName: item.name,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Failed to save description");
      }
    },
    [item.id, item.name, catalogId, catalogSlug, activeLocale, defaultLocale],
  );

  const savePrice = React.useCallback(
    async (nextCents: number) => {
      const result = await updateDefaultVariationPrice({
        catalogId,
        catalogSlug,
        itemId: item.id,
        priceCents: nextCents,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Failed to save price");
      }
    },
    [item.id, catalogId, catalogSlug],
  );

  // Item shape from the page-level query embeds price via item_variations
  // join — the EditableItemCard expects a flat price_cents field per the
  // PublicItem / ItemCardProps shape. The PublicItem type also requires a
  // modifier_lists array; CardMarkup doesn't actually use it for rendering
  // (only Inspector does, via a separate query), so we satisfy the type
  // with an empty array. PR 3 / inspector wiring fetches the real lists
  // when the merchant selects an item.
  //
  // Name + description come from the locale-aware resolver above so a
  // non-default-locale tab shows the translated value (or the italic
  // fallback when no translation exists).
  const cardItem = {
    id: item.id,
    slug: item.slug,
    category_id: item.category_id,
    name: nameField.value,
    description: descriptionField.value,
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
  translations,
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
                translations={translations}
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
