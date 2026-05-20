"use client";

/**
 * item-type-select.tsx — compact Square-style item-type picker.
 *
 * Used in the EditorSheet (replaces the prior read-only display) and is
 * the same affordance Square shows in its "Edit item" sheet:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [icon]  Item type                                ⌄  │
 *   │         Physical good                                │
 *   └──────────────────────────────────────────────────────┘
 *
 *   Open:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [icon]  Prepared food and beverage                  │
 *   │         Best for restaurants or food venues.        │
 *   ├──────────────────────────────────────────────────────┤
 *   │ [icon]  Physical good                          ✓    │
 *   │         Best for retail items such as clothing.     │
 *   └──────────────────────────────────────────────────────┘
 *
 * Composed on top of shadcn Select (Radix under the hood). The trigger
 * renders custom JSX (icon + two-line label) instead of relying on
 * SelectValue mirroring, because SelectValue can't host arbitrary HTML
 * cleanly.
 *
 * Only the two ENABLED product types are shown (REGULAR + FOOD_AND_BEV).
 * Other types (EVENT, DIGITAL, DONATION, etc.) live in the
 * CreateItemFlowDialog's "request feature" surface — that's where
 * merchants discover what's "coming soon."
 */

import * as React from "react";
import { Tag, UtensilsCrossed, type LucideIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { CatalogItemProductType } from "./product-types";

export type ItemTypeOption = {
  value: CatalogItemProductType;
  title: string;
  description: string;
  Icon: LucideIcon;
};

/**
 * Canonical option set. Order matters — Food & beverage first (Krafta's
 * primary persona is the Tashkent cafe), Physical good second.
 */
export const ITEM_TYPE_OPTIONS: ItemTypeOption[] = [
  {
    value: "FOOD_AND_BEV",
    title: "Prepared food and beverage",
    description: "Best for restaurants or other food venues.",
    Icon: UtensilsCrossed,
  },
  {
    value: "REGULAR",
    title: "Physical good",
    description: "Best for retail items such as clothing or jewelry.",
    Icon: Tag,
  },
];

export type ItemTypeSelectProps = {
  value: CatalogItemProductType;
  onValueChange: (next: CatalogItemProductType) => void;
  disabled?: boolean;
  /** Override the default option set. Useful for tests or surfaces that
   *  want to enable additional types. */
  options?: ItemTypeOption[];
};

export function ItemTypeSelect({
  value,
  onValueChange,
  disabled,
  options = ITEM_TYPE_OPTIONS,
}: ItemTypeSelectProps) {
  // Fallback to first option when the merchant's stored product_type
  // isn't enabled in the UI (e.g. legacy item with type=ONLINE_SERVICE
  // that this picker doesn't surface).
  const selected = options.find((o) => o.value === value) ?? options[0];
  const SelectedIcon = selected.Icon;

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as CatalogItemProductType)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          // Override shadcn defaults: full width, taller (two-line label),
          // larger gap between icon column and text column.
          "h-auto w-full justify-between gap-3 px-3 py-2",
          // Push the chevron icon to size-5 to match the visual weight
          // of Square's reference.
          "[&>svg:last-child]:size-5 [&>svg:last-child]:opacity-100",
        )}
        aria-label={`Item type: ${selected.title}`}
      >
        <span className="flex flex-1 items-center gap-3 text-left">
          <IconBadge>
            <SelectedIcon className="size-5" />
          </IconBadge>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-medium text-muted-foreground">
              Item type
            </span>
            <span className="truncate text-sm font-semibold">
              {selected.title}
            </span>
          </span>
        </span>
      </SelectTrigger>
      <SelectContent
        // Match the trigger's width so the dropdown lines up under it.
        className="min-w-[var(--radix-select-trigger-width)]"
        position="popper"
        sideOffset={4}
      >
        {options.map((opt) => {
          const OptIcon = opt.Icon;
          return (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className={cn(
                // Override default item padding so the icon + 2-line
                // text get breathing room. Drop the right-side check
                // indicator slot since we don't need it — selection is
                // implied by the trigger updating.
                "py-2.5 pl-3 pr-3",
                // The default SelectItem reserves space for the check
                // indicator at the right. We hide it; selection state
                // is already obvious via the trigger.
                "[&_[data-slot=select-item-indicator]]:hidden",
              )}
            >
              <span className="flex items-center gap-3">
                <IconBadge>
                  <OptIcon className="size-5" />
                </IconBadge>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold leading-tight">
                    {opt.title}
                  </span>
                  <span className="text-xs leading-tight text-muted-foreground">
                    {opt.description}
                  </span>
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * IconBadge — the rounded square that frames each option's icon.
 * Extracted because it appears in both the trigger and the items; keeps
 * them visually in lockstep.
 */
function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        "bg-muted text-foreground",
      )}
    >
      {children}
    </span>
  );
}
