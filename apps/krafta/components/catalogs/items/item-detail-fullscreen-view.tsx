"use client";

/**
 * item-detail-fullscreen-view.tsx — customer-facing item detail.
 *
 * Layout (top → bottom):
 *
 *   ┌─────────────────────────────────────┐
 *   │ Sticky header — Share, Close        │  ← always reachable, no
 *   ├─────────────────────────────────────┤    contrast issue
 *   │                                     │
 *   │   Image (capped at 55dvh)           │  ← cropped via object-cover
 *   │                                     │    to keep title+price above
 *   │                                     │    the fold for any aspect
 *   │                                     │    ratio. Hidden entirely
 *   ├─────────────────────────────────────┤    when no imageUrl.
 *   │ Category eyebrow                    │  ← title was overlaid on
 *   │ Item title                          │    the image in v1; moved
 *   │ Price (mono tabular-nums)           │    into the body so it
 *   │ Description (if present)            │    works for no-image items
 *   │ Modifier picker (if any)            │    and stays legible over
 *   │                                     │    any product photo.
 *   ├─────────────────────────────────────┤
 *   │ Sticky CTA bar — Add to cart        │
 *   └─────────────────────────────────────┘
 *
 * Design decisions vs. KRA-94 v1:
 *
 *   • Image container shape: ALWAYS the catalog's configured aspect
 *     ratio (from `settings_layout.itemCard.aspectRatio` on the
 *     catalog, surfaced as `itemAspectRatio`). The merchant picked
 *     that ratio for the grid; the detail view honors it so every
 *     item presents in the same shape.
 *
 *   • Image fit: object-contain. The detail view's contract with the
 *     customer is "show me the WHOLE product photo". A portrait shot
 *     of a model in a 3:4 container gets letterbox bars on the sides
 *     (image fills height, narrower than container). A landscape
 *     bracelet shot in a 3:4 container gets letterbox top + bottom
 *     (image fills width, shorter than container). The bg-muted bars
 *     are quiet and chrome-neutral. This is Amazon's / Shopify's
 *     default for product detail — accept the bars, never crop.
 *
 *     For the catalog GRID, individual card variants use object-cover
 *     to keep the grid visually uniform — different contract, same
 *     ratio, different fit mode. The two surfaces serve different
 *     jobs.
 *
 *     NOTE: we use raw CSS `aspect-ratio` here instead of the shadcn
 *     `<AspectRatio>` primitive. Radix's primitive uses the
 *     padding-bottom trick (paddingBottom: 100/ratio%) which locks
 *     the wrapper's height to `width × (1/ratio)` and IGNORES
 *     min/max-height. CSS aspect-ratio property does the right
 *     thing — when min/max-height kicks in, the box adapts and the
 *     ratio is treated as a preference, not a hard constraint.
 *
 *   • min-height: 35dvh, max-height: 55dvh on the container. Image
 *     area is always at least 35% of the viewport (no postage-stamp
 *     images on iPhone SE — the previous bug) and never more than
 *     55% (price stays above the fold on tall phones). 35-55% matches
 *     the range Apple Store / Square / Doordash / Shopify all sit in.
 *
 *   • Title + category eyebrow moved out of the image overlay into the
 *     white body. The old white-on-dark-gradient pattern was unreadable
 *     for no-image items and fragile on busy product photos. DESIGN.md's
 *     brand voice ("calm, dense, confident, Linear-adjacent") wants a
 *     bold dark title on white, not Instagram-style hero overlay.
 *
 *   • Header buttons float as glassmorphic circles, absolutely
 *     positioned inside a zero-height sticky anchor at the top of the
 *     modal's scroll context. The anchor takes no vertical space, so
 *     the image goes edge-to-edge from the modal's top edge; the
 *     buttons stay pinned to top-right as the customer scrolls. Both
 *     buttons cluster on the right so neither sits in iOS's left-edge
 *     swipe-back zone.
 *
 *     Style: dark backdrop + white icon, ALWAYS (not theme-adaptive).
 *     This is the media-button convention used by YouTube, Instagram,
 *     Apple Photos, Google Photos. Theme-adaptive buttons would blend
 *     with white images in dark mode and dark images in light mode;
 *     the always-dark style with a faint white border + drop shadow
 *     reads cleanly over any photo brightness. When the customer
 *     scrolls past the image and the buttons end up over body content,
 *     they read as media-overlay chrome rather than page chrome —
 *     acceptable trade for the bulletproof image contrast.
 *
 *   • Add-to-cart button is always enabled. When a required modifier
 *     list isn't filled, clicking scrolls to the first invalid list and
 *     briefly flashes a destructive ring around it. Disabled-without-
 *     explanation buttons are dead ends for customers.
 *
 *   • Price uses font-mono tabular-nums per DESIGN.md §Typography
 *     ("font-mono tabular-nums for prices in UZS"). Card-default still
 *     uses the regular weight per KRA-35 PR1's byte-identical promise;
 *     that promise is resolved for the detail view.
 *
 *   • Native Web Share API tried first; clipboard is the fallback. UZ
 *     customers share over Telegram constantly — native share sheet is
 *     the high-leverage path.
 *
 *   • "Close" button text routes through a small inline locale map
 *     instead of the hardcoded "Закрыть". Storefront chrome doesn't
 *     have a formal i18n module yet; this is the bridge until one
 *     lands.
 */

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Share2, ShoppingCart, Trash2, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ItemDetailProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useOptionalCart } from "@/components/catalogs/cart";
import {
  ModifierPicker,
  modifierListFieldsetId,
  type ModifierPickerChange,
} from "@/components/catalogs/items/modifier-picker";
import { cn } from "@/lib/utils";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

// Storefront chrome strings — the storefront doesn't have a formal
// i18n module yet (only entity translations via item_translations etc.
// are wired). This local map covers the three locales the catalog
// actually ships in v1; anything else falls back to English. When the
// chrome i18n module lands, swap this for a real lookup.
const CLOSE_LABEL: Record<string, string> = {
  ru: "Закрыть",
  "uz-Latn": "Yopish",
  en: "Close",
};

function closeLabelFor(locale: string): string {
  return CLOSE_LABEL[locale] ?? CLOSE_LABEL.en;
}

export function ItemDetailFullscreen({
  item,
  category,
  imageUrl,
  itemAspectRatio,
  backHref,
  onClose,
  currencySettings,
  activeLocale,
  defaultLocale,
}: ItemDetailProps) {
  const itemDefaults = {
    name: item.name,
    description: item.description,
    image_alt: item.image_alt,
  };
  const localizedName = pickLocalizedField({
    translations: item.translations,
    defaults: itemDefaults,
    activeLocale,
    defaultLocale,
    field: "name",
  }).value;
  const localizedDescription =
    pickLocalizedField({
      translations: item.translations,
      defaults: itemDefaults,
      activeLocale,
      defaultLocale,
      field: "description",
    }).value || null;
  const localizedImageAlt =
    pickLocalizedField({
      translations: item.translations,
      defaults: itemDefaults,
      activeLocale,
      defaultLocale,
      field: "image_alt",
    }).value || null;
  const localizedCategoryName = category
    ? pickLocalizedField({
        translations: category.translations,
        defaults: {
          name: category.name,
          description: category.description ?? null,
          image_alt: null,
        },
        activeLocale,
        defaultLocale,
        field: "name",
      }).value
    : null;
  const ratio = itemAspectRatio ?? 4 / 5;
  const cart = useOptionalCart();

  // Picker state is owned here so the add-to-cart click handler can
  // read selections + validity + the first-invalid-list id. Items with
  // no visible modifier lists short-circuit to isValid=true.
  const hasVisibleModifierLists = item.modifier_lists.some(
    (list) => !list.hidden_from_customer,
  );
  const [pickerState, setPickerState] = useState<ModifierPickerChange>({
    selections: [],
    isValid: !hasVisibleModifierLists,
    firstInvalidListId: null,
    invalidRequiredCount: 0,
  });
  const handlePickerChange = useCallback(
    (change: ModifierPickerChange) => setPickerState(change),
    [],
  );

  // Flash state for the "scroll to first invalid required list" affordance.
  // Set when the customer presses Add and validation fails; cleared after
  // ~900ms so the destructive ring fades rather than flickers.
  const [flashListId, setFlashListId] = useState<string | null>(null);
  useEffect(() => {
    if (!flashListId) return;
    const timer = window.setTimeout(() => setFlashListId(null), 900);
    return () => window.clearTimeout(timer);
  }, [flashListId]);

  // Returns true when the click should proceed to add-to-cart; false
  // when validation failed and we redirected the customer's eye instead.
  const validateBeforeAdd = useCallback((): boolean => {
    if (pickerState.isValid) return true;
    const targetId = pickerState.firstInvalidListId;
    if (targetId) {
      const el = document.getElementById(modifierListFieldsetId(targetId));
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashListId(targetId);
    }
    return false;
  }, [pickerState.firstInvalidListId, pickerState.isValid]);

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;

    // Web Share API first — on iOS this opens the native share sheet,
    // which is where Telegram, WhatsApp, etc. live. Customers in UZ
    // share menus over Telegram constantly. Falling back to clipboard
    // is the second-best experience.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: localizedName,
          text: localizedDescription ?? localizedName,
          url,
        });
        return;
      } catch (error) {
        // User cancelled the sheet — treat as a no-op, not an error.
        if ((error as Error)?.name === "AbortError") return;
        // Other errors fall through to clipboard.
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied", {
          description: "Paste it anywhere to share this item.",
        });
        return;
      } catch {
        // fall through to legacy copy
      }
    }

    try {
      const input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "true");
      input.style.position = "absolute";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      toast("Link copied", {
        description: "Paste it anywhere to share this item.",
      });
    } catch {
      toast.error("Unable to copy link");
    }
  };

  // The outer div is the scroll context: sticky header + sticky CTA
  // both anchor against THIS element, not the document. Important when
  // the component is mounted inside the controller's modal overlay
  // (which already has the body scroll-locked).
  return (
    <div
      className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-y-auto bg-background text-foreground md:h-[85dvh] md:rounded-sm md:shadow-xl [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
    >
      {/* Floating chrome — Share + Close. The outer sticky div has
          h-0 + no background so it takes ZERO vertical space; the
          image starts edge-to-edge from the top of the modal. The
          buttons are absolutely positioned inside the anchor so they
          stay pinned to the top-right corner as the customer scrolls.
          Always-dark glassmorphic style (bg-black/50 + text-white +
          border-white/15) reads cleanly over any image brightness —
          this is the YouTube / Instagram / Apple Photos media-button
          convention. backdrop-blur + shadow keep the floating feel. */}
      <div className="sticky top-0 z-20 h-0">
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            onClick={handleShare}
            className="h-10 w-10 rounded-full border border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md hover:bg-black/65 hover:text-white"
            aria-label="Share"
          >
            <Share2 className="size-4" />
          </Button>
          {onClose ? (
            <Button
              type="button"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md hover:bg-black/65 hover:text-white"
              aria-label={closeLabelFor(activeLocale)}
            >
              <XIcon className="size-5" />
            </Button>
          ) : (
            <Button
              asChild
              size="icon"
              className="h-10 w-10 rounded-full border border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md hover:bg-black/65 hover:text-white"
            >
              <Link href={backHref ?? "#"} aria-label={closeLabelFor(activeLocale)}>
                <XIcon className="size-5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Image — strict catalog aspect ratio (raw CSS aspect-ratio so
          min/max-height actually clamp; the shadcn AspectRatio
          primitive uses padding-bottom and won't respect those). The
          container is always the merchant's configured shape (3:4,
          4:5, 1:1, 16:9, whatever). The IMAGE uses object-contain so
          the full photo is always visible — bg-muted bars fill any
          gap when the photo's natural ratio doesn't match the
          container's. The min/max-height pair clamps the area to
          35-55% of the viewport. */}
      {imageUrl && (
        <div
          className="relative w-full overflow-hidden bg-muted"
          style={{
            aspectRatio: ratio,
            minHeight: "35dvh",
            maxHeight: "55dvh",
          }}
        >
          <Image
            src={imageUrl}
            alt={localizedImageAlt ?? localizedName}
            fill
            sizes="(max-width: 640px) 100vw, 480px"
            className="h-full w-full object-contain"
            priority
          />
        </div>
      )}

      {/* Body — title, price, description, modifiers. pb-28 reserves
          space for the sticky CTA at the bottom. */}
      <div className="flex flex-1 flex-col gap-5 px-5 pb-28 pt-5">
        <div className="space-y-1.5">
          {localizedCategoryName && (
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {localizedCategoryName}
            </p>
          )}
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            {localizedName}
          </h2>
        </div>

        {/* Price: smaller than the title so it supports without
            competing. font-mono tabular-nums per DESIGN.md. */}
        <p className="text-2xl font-mono font-semibold tabular-nums text-foreground">
          {formatPriceCents(item.price_cents, currencySettings)}
        </p>

        {/* Description only renders when the merchant actually wrote one.
            The previous "A detail view designed for immersive browsing…"
            placeholder leaked developer copy to customers. */}
        {localizedDescription && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {localizedDescription}
          </p>
        )}

        {cart && hasVisibleModifierLists ? (
          <div className="mt-2">
            <ModifierPicker
              modifierLists={item.modifier_lists}
              onChange={handlePickerChange}
              formatPrice={(cents) => formatPriceCents(cents, currencySettings)}
              flashListId={flashListId}
            />
          </div>
        ) : null}
      </div>

      {/* Sticky CTA — Careem-pattern split:
          LEFT: in-progress quantity stepper [🗑 / − N +]
          RIGHT: big primary Add button showing the running total, or
                 "Make N required selections" when the customer hasn't
                 picked everything required yet.
          On Close-only mode (no cart context) we fall back to the
          previous Close button.   */}
      <div className="sticky bottom-0 z-10 mt-auto w-full border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full flex-col gap-3 px-5 py-4">
          {cart ? (
            <ItemDetailBottomCta
              cart={cart}
              itemId={item.id}
              itemName={localizedName}
              basePriceCents={item.price_cents}
              currencySettings={currencySettings}
              pickerState={pickerState}
              onValidateBeforeAdd={validateBeforeAdd}
              onClose={onClose}
            />
          ) : onClose ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full border-border/60 text-foreground hover:bg-muted/40"
            >
              {closeLabelFor(activeLocale)}
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              className="w-full border-border/60 text-foreground hover:bg-muted/40"
            >
              <Link href={backHref ?? "#"}>{closeLabelFor(activeLocale)}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Bottom CTA — Careem-pattern split
//
// Layout:
//   [ 🗑 / − N + ]   [   Add  •  $X.XX   ]
//   ^ in-progress     ^ filled, primary
//     qty stepper       price = (item + mods) × qty
//
// State:
//   * In-progress qty lives locally to this component (default 1).
//     Bumping it does NOT touch the cart — it's the count the customer
//     wants to add IN ONE SHOT. After Add commits, qty resets to 1 and
//     the picker stays open so the customer can change mods and add
//     another configuration.
//   * At qty 1 the left button shows a trash icon (clear visual signal
//     "next tap removes this in-progress add"). Tapping it at qty 1
//     closes the modal — same intent as "I don't want to add this."
//
// Disabled / gated state:
//   * `pickerState.invalidRequiredCount > 0` → button disabled, text
//     reads "Make N required selection(s)" + the running price still
//     shows. Tapping calls onValidateBeforeAdd which scrolls the first
//     unfilled required list into view and flashes it.
// ──────────────────────────────────────────────────────────────────────

function ItemDetailBottomCta(props: {
  cart: NonNullable<ReturnType<typeof useOptionalCart>>;
  itemId: string;
  itemName: string;
  basePriceCents: number;
  currencySettings: CurrencySettings | undefined;
  pickerState: ModifierPickerChange;
  onValidateBeforeAdd: () => boolean;
  onClose?: () => void;
}) {
  const {
    cart,
    itemId,
    itemName,
    basePriceCents,
    currencySettings,
    pickerState,
    onValidateBeforeAdd,
    onClose,
  } = props;
  const [qty, setQty] = useState(1);
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  // Running unit price = base + sum(selected modifier deltas × their qty).
  // Total price = unit × in-progress qty. Recomputes synchronously as
  // the customer toggles modifiers or bumps qty.
  const modifierDeltaCents = pickerState.selections.reduce(
    (sum, sel) => sum + sel.basePriceCentsDelta * sel.quantity,
    0,
  );
  const unitPriceCents = basePriceCents + modifierDeltaCents;
  const totalPriceCents = unitPriceCents * qty;

  const requiredCount = pickerState.invalidRequiredCount;
  const isGated = requiredCount > 0;

  const handleDecrement = () => {
    if (qty > 1) {
      setQty(qty - 1);
    } else if (onClose) {
      // qty=1 + trash tap = "I don't want this" → close the modal.
      onClose();
    }
  };

  const handleIncrement = () => setQty(qty + 1);

  const handleAdd = async () => {
    if (!onValidateBeforeAdd()) return;
    try {
      await cart.addItem({
        itemId,
        name: itemName,
        basePriceCents,
        quantity: qty,
        modifiers: pickerState.selections.map((s) => ({
          modifierListId: s.modifierListId,
          modifierId: s.modifierId,
          quantity: s.quantity,
          name: s.name,
          basePriceCentsDelta: s.basePriceCentsDelta,
          text_value: s.text_value,
        })),
      });
      toast.success(t("add_to_cart.added", { name: itemName }), {
        action: {
          label: t("add_to_cart.view"),
          onClick: () => {
            cart.open();
            onClose?.();
          },
        },
      });
      // Reset in-progress qty so the picker can be used for another
      // configuration. Don't auto-close — Careem doesn't either; let
      // the customer choose to view the cart or add another.
      setQty(1);
    } catch {
      // cart-provider toasts the error already.
    }
  };

  const addButtonLabel = isGated
    ? requiredCount === 1
      ? t("add_to_cart.gated_required_one")
      : t("add_to_cart.gated_required_many", { count: requiredCount })
    : t("add_to_cart.label_with_price", {
        price: formatPriceCents(totalPriceCents, currencySettings),
      });

  return (
    <div className="flex w-full items-stretch gap-3">
      {/* In-progress qty stepper — outline-bordered, neutral color so it
          doesn't compete with the primary Add button. */}
      <div
        className="inline-flex h-12 items-center gap-0 rounded-md border border-input bg-background"
        role="group"
        aria-label="Quantity to add"
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleDecrement}
          className="h-12 w-12 rounded-md hover:bg-muted"
          aria-label={qty > 1 ? "Decrease quantity" : "Cancel"}
        >
          {qty > 1 ? (
            <Minus className="size-5" aria-hidden />
          ) : (
            <Trash2 className="size-5" aria-hidden />
          )}
        </Button>
        <span
          className="min-w-[2ch] px-2 text-center font-mono text-base font-semibold tabular-nums"
          aria-live="polite"
        >
          {qty}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleIncrement}
          className="h-12 w-12 rounded-md hover:bg-muted"
          aria-label="Increase quantity"
        >
          <Plus className="size-5" aria-hidden />
        </Button>
      </div>

      {/* Primary add button. Disabled when required selections aren't
          met; copy switches to the gating message in that state. The
          label uses the default sans (Geist) so the "Add" / gating
          copy reads as plain UI text; tabular-nums alone keeps the
          interpolated price digit-aligned within the label. Was
          font-mono on the whole button which made the localized copy
          ("2 ta majburiy tanlovni bajaring") read as a monospace
          terminal line — wrong tonally. */}
      <Button
        type="button"
        size="lg"
        onClick={handleAdd}
        disabled={isGated}
        className={cn(
          "h-12 flex-1 text-base font-semibold tabular-nums",
          "disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground",
        )}
      >
        <ShoppingCart className="mr-2 size-4" aria-hidden />
        {addButtonLabel}
      </Button>
    </div>
  );
}
