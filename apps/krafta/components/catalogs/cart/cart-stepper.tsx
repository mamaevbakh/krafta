"use client";

import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

import { AnimatedQty } from "./animated-qty";

/**
 * Single source of truth for the cart minus/qty/plus stepper.
 *
 * Replaces four near-identical implementations (catalog-card stepper,
 * item-detail-fullscreen qty stepper, cart-drawer line stepper,
 * customisations-drawer config-row stepper) with one component and a
 * variant prop. Keeps keyboard / aria-labels / data-cart-action /
 * sizing settled in one place so the surfaces can't drift.
 *
 * The component is presentation-only — it does NOT consume the cart
 * context. Callers wire `onDecrement` / `onIncrement` to whatever
 * cart mutation makes sense (bumpQuantity in most places, "open the
 * customisations disambiguator" on a catalog card whose item has
 * multiple configurations in the cart).
 *
 * Variants:
 *   • card    — catalog-card floating pill. ButtonGroup with default
 *     variant icon buttons, qty pill on primary bg. Trash icon at
 *     qty=1. Set `floating` to position absolute over the photo.
 *   • drawer  — cart drawer inline stepper. Plain flex, outline icon
 *     h-8 buttons. Always minus icon (the drawer renders a separate
 *     Trash button alongside).
 *   • detail  — item-detail Add-to-Cart morph. Compact inline-flex
 *     with border-input chrome, ghost h-11 buttons, mono qty. Trash
 *     icon at qty=1. Sits alongside the "View cart" button in a
 *     `<div className="flex w-full items-stretch gap-3">` row.
 *   • config  — customisations-drawer config row. ButtonGroup with
 *     ghost h-9 buttons. Trash icon at qty=1.
 *
 * Behavior choice consolidated: variants `card`, `detail`, and
 * `config` show a trash icon at qty=1 because they live on surfaces
 * where the line has no other "remove" affordance. Only `drawer`
 * always shows a minus — the drawer renders its own separate Trash
 * button alongside.
 */
export type CartStepperVariant = "card" | "drawer" | "detail" | "config";

type CartStepperProps = {
  quantity: number;
  /** Used for aria-label on each button. The detail variant has been
   *  shipping a generic "Decrease quantity" label that doesn't carry
   *  the item name; we keep that detail-specific label for visual
   *  parity but route the item name through here for the others. */
  itemName: string;
  variant: CartStepperVariant;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
  className?: string;
  /** Catalog-card only: absolute-position the stepper at bottom-right
   *  over the photo (Careem big-photo pattern). Ignored for non-card
   *  variants. */
  floating?: boolean;
};

export function CartStepper({
  quantity,
  itemName,
  variant,
  onDecrement,
  onIncrement,
  disabled,
  className,
  floating,
}: CartStepperProps) {
  const showTrashAtMin =
    variant === "card" || variant === "config" || variant === "detail";
  const isAtMin = quantity <= 1;
  const DecrementIcon = showTrashAtMin && isAtMin ? Trash2 : Minus;

  // The detail variant lives inside the item-detail fullscreen sheet
  // alongside its own "View cart" CTA, so the aria-label uses the
  // shorter generic phrasing the existing site shipped — the item
  // name is already loud at the top of that sheet.
  const decrementAriaLabel =
    variant === "detail"
      ? isAtMin
        ? "Remove from cart"
        : "Decrease quantity"
      : showTrashAtMin && isAtMin
        ? `Remove ${itemName} from cart`
        : `Decrease ${itemName} quantity`;
  const incrementAriaLabel =
    variant === "detail" ? "Increase quantity" : `Increase ${itemName} quantity`;
  const groupAriaLabel =
    variant === "detail"
      ? "Cart quantity for this configuration"
      : `Cart quantity for ${itemName}`;

  // ── ButtonGroup variants (card, config) ─────────────────────────────
  if (variant === "card" || variant === "config") {
    const buttonVariant = variant === "card" ? "default" : "ghost";
    const buttonSizeClass = variant === "config" ? "h-9 w-9" : undefined;
    const iconSizeClass = variant === "config" ? "h-4 w-4" : undefined;

    return (
      <ButtonGroup
        data-cart-action
        aria-label={groupAriaLabel}
        className={cn(
          variant === "card"
            ? "rounded-md border border-black/15 shadow-lg"
            : "rounded-md border border-input",
          variant === "card" && floating && "absolute bottom-3 right-3 z-10",
          className,
        )}
      >
        <Button
          type="button"
          size="icon"
          variant={buttonVariant}
          className={buttonSizeClass}
          onClick={onDecrement}
          disabled={disabled}
          aria-label={decrementAriaLabel}
        >
          <DecrementIcon className={iconSizeClass} />
        </Button>
        <ButtonGroupText
          className={cn(
            // border-transparent: ButtonGroupText ships a light `--border`
            // hairline (right for the light-bg `config` variant). On the dark
            // `bg-primary` card pill it reads as glaring white lines on the
            // top/right/bottom edges (the left is already dropped by the
            // group's border-l-0). The pill's outer border-black/15 already
            // frames the group, so kill the inner hairline here.
            variant === "card" &&
              "border-transparent bg-primary text-primary-foreground",
            variant === "config" && "min-w-[2.5rem] justify-center text-center",
          )}
        >
          <AnimatedQty
            value={quantity}
            className={variant === "config" ? "text-sm font-semibold" : undefined}
          />
        </ButtonGroupText>
        <Button
          type="button"
          size="icon"
          variant={buttonVariant}
          className={buttonSizeClass}
          onClick={onIncrement}
          disabled={disabled}
          aria-label={incrementAriaLabel}
        >
          <Plus className={iconSizeClass} />
        </Button>
      </ButtonGroup>
    );
  }

  // ── Flex variants (drawer, detail) ──────────────────────────────────
  if (variant === "drawer") {
    return (
      <div
        data-cart-action
        role="group"
        aria-label={groupAriaLabel}
        className={cn("flex items-center gap-1", className)}
      >
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="relative h-8 w-8 before:absolute before:-inset-1.5 before:content-['']"
          onClick={onDecrement}
          disabled={disabled || quantity <= 1}
          aria-label={decrementAriaLabel}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <AnimatedQty
          value={quantity}
          className="min-w-[2ch] text-center font-mono text-sm tabular-nums"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="relative h-8 w-8 before:absolute before:-inset-1.5 before:content-['']"
          onClick={onIncrement}
          disabled={disabled}
          aria-label={incrementAriaLabel}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // variant === "detail"
  // Compact inline-flex (intrinsic width, not w-full) so the caller's
  // flex row can place a "View cart" CTA at flex-1 alongside.
  return (
    <div
      data-cart-action
      role="group"
      aria-label={groupAriaLabel}
      className={cn(
        "inline-flex h-11 items-center gap-0 rounded-md border border-input bg-background",
        className,
      )}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-11 w-10 rounded-md hover:bg-muted"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={decrementAriaLabel}
      >
        <DecrementIcon className="size-4" />
      </Button>
      <AnimatedQty
        value={quantity}
        className="min-w-[1.75ch] px-1 text-center font-mono text-sm font-semibold tabular-nums"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-11 w-10 rounded-md hover:bg-muted"
        onClick={onIncrement}
        disabled={disabled}
        aria-label={incrementAriaLabel}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
