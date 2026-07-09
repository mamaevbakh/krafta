"use client";

/**
 * library-row.tsx — KRA-35 Iter 2 / T1 (revised): compact row + DragOverlay preview.
 *
 * Two exported components:
 *   - LibraryRow       — the normal sortable row that lives inside a
 *                        SortableContext. Uses useSortable + click-to-select.
 *   - LibraryRowDragPreview — a hook-free presentation-only clone for
 *                             dnd-kit's <DragOverlay>. Same visual layout,
 *                             no useSortable / useCanvasSelection.
 *
 * Both render the same `LibraryRowMarkup` so the visual stays in lockstep —
 * if you change the row chrome (thumbnail size, font, layout) you change
 * it once.
 *
 * Per Iter 2 design decisions:
 *   - D2 (compact rows): 56px tall, 40px thumbnail, name + price only.
 *     No description in row. No inline editing.
 *   - D3 (visible drag affordance): GripVertical icon on the left signals
 *     draggability. NOT exclusive drag target — whole row carries dnd-kit
 *     listeners per Pass 6 D4B below.
 *   - Pass 6 D4B (mobile drag/tap): the whole row is the drag target.
 *     dnd-kit's PointerSensor gates via 8px activation; TouchSensor gates
 *     via 250ms long-press. Quick taps → onClick → opens editor.
 *
 *   - touchAction "pan-y" lets mobile browsers handle vertical scroll
 *     while the long-press delay is running. Earlier "none" disabled
 *     scrolling on rows entirely — merchants couldn't scroll the canvas
 *     by touching items on phones.
 */

import * as React from "react";
import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import type { Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { useT } from "@/lib/locales/dashboard/context";

import { useCanvasSelection } from "./canvas-with-selection";
import { useCanvasLocale } from "./locale-context";

type ItemTranslation = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

export type LibraryRowProps = {
  item: Item;
  translations: ItemTranslation[];
  currencySettings: CurrencySettings;
};

// ---------------------------------------------------------------------------
// Shared data hook — locale-aware name resolution + image URL.
// Both the sortable row and the drag-overlay preview need this; extracting
// it keeps the two consumers from drifting.
// ---------------------------------------------------------------------------
function useLibraryRowData(item: Item, translations: ItemTranslation[]) {
  const { activeLocale, defaultLocale } = useCanvasLocale();

  const imageUrl = React.useMemo(() => getItemImageUrl(item), [item]);

  const itemTranslations = React.useMemo(
    () => translations.filter((t) => t.item_id === item.id),
    [translations, item.id],
  );

  const nameField = pickLocalizedField({
    translations: itemTranslations,
    defaults: {
      name: item.name,
      description: item.description,
      image_alt: item.image_alt,
    },
    activeLocale,
    defaultLocale,
    field: "name",
  });

  return { imageUrl, nameField };
}

// ---------------------------------------------------------------------------
// LibraryRowMarkup — pure presentational; no hooks, no dnd-kit.
// Receives already-resolved values from the caller (the wrapper component
// or the drag preview). This is the single source of truth for what a
// row looks like visually.
// ---------------------------------------------------------------------------
type LibraryRowMarkupProps = {
  imageUrl: string | null;
  imageAlt: string | null;
  nameValue: string;
  isFallback: boolean;
  priceCents: number;
  currencySettings: CurrencySettings;
  isSelected?: boolean;
  isPulsing?: boolean;
  isDragging?: boolean;
  /** When true, the row renders as a free-floating overlay clone (used by
   *  dnd-kit's <DragOverlay>): a slight scale-up + shadow gives the
   *  "lifted card" feel. */
  isOverlay?: boolean;
};

function LibraryRowMarkup({
  imageUrl,
  imageAlt,
  nameValue,
  isFallback,
  priceCents,
  currencySettings,
  isSelected,
  isPulsing,
  isDragging,
  isOverlay,
}: LibraryRowMarkupProps) {
  const t = useT();
  return (
    <div
      className={cn(
        "group flex h-14 items-center gap-3 rounded-xs border bg-card px-3",
        "cursor-pointer transition-colors",
        !isOverlay && "hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isSelected && "ring-1 ring-ring ring-offset-2",
        isDragging && !isOverlay && "shadow-md",
        // DragOverlay clone styling: slight lift via shadow + opacity-95
        // to suggest it's the "real one" the cursor is carrying.
        isOverlay && "shadow-lg ring-1 ring-ring/30 cursor-grabbing",
        isPulsing && "animate-row-flash",
      )}
    >
      <GripVertical
        className={cn(
          "size-5 shrink-0 text-muted-foreground transition-colors",
          !isOverlay && "group-hover:text-foreground",
          isOverlay && "text-foreground",
        )}
        aria-hidden="true"
      />

      <div className="relative size-10 shrink-0 overflow-hidden rounded-xs bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt ?? ""}
            fill
            sizes="40px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            isFallback && "italic text-muted-foreground",
          )}
        >
          {nameValue || t("items.untitled_item")}
        </span>
      </div>

      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {formatPriceCents(priceCents, currencySettings)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LibraryRow — the sortable row. Uses useSortable + click-to-select.
// ---------------------------------------------------------------------------
export function LibraryRow({
  item,
  translations,
  currencySettings,
}: LibraryRowProps) {
  const t = useT();
  const { selectedItemId, setSelectedItemId, pulsingItemId } =
    useCanvasSelection();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const { imageUrl, nameField } = useLibraryRowData(item, translations);

  const isSelected = selectedItemId === item.id;
  const isPulsing = pulsingItemId === item.id;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // While the OVERLAY is showing this row's clone, hide the in-place
    // copy so it doesn't compete visually. dnd-kit's `isDragging` flag is
    // true on the source row; DragOverlay renders the clone. Hiding here
    // gives the conventional "empty slot" preview.
    opacity: isDragging ? 0 : 1,
    // `touchAction: "pan-y"` lets mobile vertical scroll work while the
    // TouchSensor's 250ms long-press delay is running. Without this the
    // browser would prevent scrolling on rows entirely.
    touchAction: "pan-y",
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => setSelectedItemId(item.id)}
      style={style}
      data-slot="library-row"
      data-row-item-id={item.id}
      data-selected={isSelected || undefined}
      aria-label={t("items.row_aria", {
        name: nameField.value || t("items.untitled_item"),
      })}
    >
      <LibraryRowMarkup
        imageUrl={imageUrl}
        imageAlt={item.image_alt}
        nameValue={nameField.value}
        isFallback={nameField.isFallback}
        priceCents={item.price_cents}
        currencySettings={currencySettings}
        isSelected={isSelected}
        isPulsing={isPulsing}
        isDragging={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LibraryRowDragPreview — for dnd-kit's <DragOverlay>.
// Renders the same markup with the "lifted card" overlay styling. No
// useSortable (overlay is rendered outside any SortableContext anyway).
// ---------------------------------------------------------------------------
export function LibraryRowDragPreview({
  item,
  translations,
  currencySettings,
}: LibraryRowProps) {
  const { imageUrl, nameField } = useLibraryRowData(item, translations);

  return (
    <LibraryRowMarkup
      imageUrl={imageUrl}
      imageAlt={item.image_alt}
      nameValue={nameField.value}
      isFallback={nameField.isFallback}
      priceCents={item.price_cents}
      currencySettings={currencySettings}
      isOverlay
    />
  );
}
