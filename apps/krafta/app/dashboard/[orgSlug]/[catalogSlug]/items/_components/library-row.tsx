"use client";

/**
 * library-row.tsx — KRA-35 Iter 2 / T1: compact 56px row component for the Library canvas.
 *
 * Replaces EditableItemCard's role on the canvas. Per Iter 2 design decisions:
 *
 *   - D2 (compact rows): 56px tall, 40px thumbnail, name + price only.
 *     No description in row. No inline editing.
 *   - D3 (visible drag affordance): GripVertical icon on the left signals
 *     draggability. NOT exclusive drag target — whole row carries dnd-kit
 *     listeners per Pass 6 D4B below.
 *   - Pass 6 D4B (mobile drag/tap): the whole row is the drag target. dnd-kit's
 *     PointerSensor (desktop) gates via 8px activation distance; TouchSensor
 *     (mobile) gates via 250ms delay. Quick taps → onClick fires → opens editor.
 *     Long-press / move → drag.
 *
 * Selection vs drag is handled entirely by dnd-kit's sensor activation
 * constraints — see `canvas-with-selection.tsx`. We don't add a separate
 * click handler that competes with drag; we attach both `listeners` and
 * `onClick` and trust the sensors.
 *
 * Locale-aware name display goes through `pickLocalizedField`. When the
 * active locale lacks a translation, falls back to the default-locale value
 * and renders it italic + muted (per DESIGN.md i18n section).
 *
 * The editor that opens when a row is clicked is still the legacy `Inspector`
 * (right-side 360px panel) for now. Iter 2 T2 swaps it for the EditorSheet.
 * Selection state lives in `useCanvasSelection`; this row is read/write.
 */

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import type { Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

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
  /** All item_translations rows loaded at the page level. Filtered per-item
   *  inside this component so the locale-aware resolver can pick the right
   *  row + per-field fallback. */
  translations: ItemTranslation[];
  currencySettings: CurrencySettings;
};

export function LibraryRow({
  item,
  translations,
  currencySettings,
}: LibraryRowProps) {
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

  // Use the legacy `items.image_path` for the canvas thumbnail. Multi-image
  // upload lives in the inspector / future EditorSheet (T2).
  const imageUrl = React.useMemo(() => getItemImageUrl(item), [item]);

  const itemTranslations = React.useMemo(
    () => translations.filter((t) => t.item_id === item.id),
    [translations, item.id],
  );

  // Locale-aware name resolution. EditableItemCard used pickLocalizedField
  // for the same purpose; we keep parity so a non-default-locale tab shows
  // the translated value (or the italic muted fallback when missing).
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

  const isSelected = selectedItemId === item.id;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // touchAction: "none" is CRITICAL for the mobile long-press pattern.
    // Without it, the browser's native touch-scrolling fights with dnd-kit's
    // TouchSensor delay detection and the long-press never registers.
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => setSelectedItemId(item.id)}
      style={style}
      data-slot="library-row"
      data-selected={isSelected || undefined}
      // The whole row is the draggable + the clickable. Sensors gate which
      // one fires (clicks under 8px on desktop / quick taps on mobile = onClick;
      // 8px+ drag on desktop / 250ms+ press on mobile = drag).
      aria-label={`${nameField.value || "Untitled item"} — click to edit, drag to reorder`}
      className={cn(
        "group flex h-14 items-center gap-3 rounded-xs border bg-card px-3",
        "cursor-pointer transition-colors",
        "hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        // Selection indicator — same ring pattern EditableItemCard used.
        isSelected && "ring-1 ring-ring ring-offset-2",
        // Functional shadow during drag only (lifts the row off the canvas
        // so the merchant sees what's moving). NOT a decorative shadow per
        // DESIGN.md anti-slop rule 9.
        isDragging && "shadow-md",
      )}
    >
      {/* Drag handle — visual affordance cue only. The dnd-kit listeners are
          on the parent (whole row) per Pass 6 D4B. This icon just tells the
          eye "this row can be dragged"; the actual gesture is sensor-gated. */}
      <GripVertical
        className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        aria-hidden="true"
      />

      {/* Thumbnail — 40px square, rounded-xs per DESIGN.md spec line 178.
          Fallback to muted box when no image (vs broken-image icon, per
          DESIGN.md empty-state principle). */}
      <div className="size-10 shrink-0 overflow-hidden rounded-xs bg-muted">
        {imageUrl ? (
          // Plain <img> is fine here — the row's image is 40px (tiny), and
          // next/image's optimization overhead isn't worth the dimensions
          // ceremony for cells of this size.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={item.image_alt ?? ""}
            className="size-full object-cover"
          />
        ) : null}
      </div>

      {/* Name — flex-1 so it consumes remaining width, truncate to single
          line. Italic + muted when the active locale falls back to the
          default locale's value (per DESIGN.md i18n: "render the default-
          locale value in italics as a visible hint"). */}
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            nameField.isFallback && "italic text-muted-foreground",
          )}
        >
          {nameField.value || "Untitled item"}
        </span>
      </div>

      {/* Price — right-aligned, mono tabular-nums per DESIGN.md. Geist Mono
          keeps wide UZS values aligned across rows in dense lists. */}
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {formatPriceCents(item.price_cents, currencySettings)}
      </span>
    </div>
  );
}
