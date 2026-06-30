"use client";

import { cn } from "@/lib/utils";
import { MinusIcon, PlusIcon, TrashIcon } from "./icons";

/**
 * Shared −/qty/+ stepper for cart surfaces. Presentation only — the caller
 * wires `onDecrement` / `onIncrement` to whatever cart mutation fits.
 *
 * When `trashAtMin` is set, the − button becomes a trash icon at qty 1 (used
 * where the row has no other remove affordance, e.g. the product-card pill and
 * the item sheet). The cart drawer renders a separate trash button, so it
 * leaves `trashAtMin` off and shows a plain disabled minus.
 */
export function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
  itemName,
  trashAtMin = false,
  disabled = false,
  className,
}: {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
  itemName: string;
  trashAtMin?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const atMin = quantity <= 1;
  const showTrash = trashAtMin && atMin;
  const DecrementIcon = showTrash ? TrashIcon : MinusIcon;

  return (
    <div
      role="group"
      aria-label={`Quantity for ${itemName}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-background",
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled || (!trashAtMin && atMin)}
        aria-label={
          showTrash
            ? `Remove ${itemName}`
            : `Decrease ${itemName} quantity`
        }
        className="flex h-9 w-9 items-center justify-center rounded-l-md text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <DecrementIcon className="size-4" />
      </button>
      <span className="min-w-[2ch] text-center text-sm font-medium tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled}
        aria-label={`Increase ${itemName} quantity`}
        className="flex h-9 w-9 items-center justify-center rounded-r-md text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
