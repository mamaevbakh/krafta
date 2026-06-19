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
import { Share2, ShoppingCart, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ItemDetailProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useOptionalCart } from "@/components/catalogs/cart";
import { CartStepper } from "@/components/catalogs/cart/cart-stepper";
import { modifierSignature } from "@/lib/cart/modifier-signature";
import {
  ModifierPicker,
  modifierListFieldsetId,
  type ModifierPickerChange,
} from "@/components/catalogs/items/modifier-picker";
import { VariationSelector } from "@/components/catalogs/items/variation-selector";
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

  // Variation selection — multi-variation items show a chip group above
  // the modifier picker; single-variation items use the default silently
  // (VariationSelector returns null in that case). Default = the row
  // flagged is_default=true; fall back to the first ordinal entry to
  // guard against catalogs where Migration 1 didn't stamp a default.
  // The selection drives:
  //   • the variation chip's selected state (selector chrome)
  //   • basePriceCents on the bottom CTA (label + line total preview)
  //   • variationId + variationName threaded to cart.addItem so the
  //     server resolves to THIS variation instead of the item's default
  //   • the matching-line probe in ItemDetailBottomCta (different
  //     variations are distinct cart lines, so each variation gets its
  //     own stepper state)
  const defaultVariation =
    item.variations.find((v) => v.is_default) ?? item.variations[0] ?? null;
  const [selectedVariationId, setSelectedVariationId] = useState<string>(
    defaultVariation?.id ?? "",
  );
  const selectedVariation =
    item.variations.find((v) => v.id === selectedVariationId) ??
    defaultVariation;
  // Effective unit price + variation name flow through the bottom CTA.
  // When the item has no variations at all (legacy / mid-migration data),
  // fall back to item.price_cents (the legacy flatten).
  const effectivePriceCents =
    selectedVariation?.price_cents ?? item.price_cents;
  const selectedVariationName = selectedVariation?.name ?? null;

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
    invalidRequiredListIds: [],
    invalidRequiredCount: 0,
  });
  const handlePickerChange = useCallback(
    (change: ModifierPickerChange) => setPickerState(change),
    [],
  );

  // ── Guided required-selection flow ────────────────────────────────
  //
  // When the customer taps the "Make N required selections" button,
  // the detail enters `inGuidedMode`. This flag is STICKY for the
  // rest of the detail's lifetime — even after the customer satisfies
  // every required list, the satisfied (green ✓) pills stay green as
  // the "you completed the journey" mark. The orange pointer pill
  // only renders while there's still an un-satisfied required list
  // (i.e. `invalidRequiredListIds` is non-empty); when the list goes
  // empty the pointer disappears but the green marks remain.
  //
  // Picking up an un-satisfied required mid-flow (after everything was
  // green) brings the orange pointer back at that list — the customer
  // can see they accidentally regressed and the guided flow continues.
  //
  // Until the customer opts in by tapping the button, every required
  // list shows a calm neutral pill — no colors compete for attention
  // during normal scroll-and-pick browsing.
  const [inGuidedMode, setInGuidedMode] = useState(false);
  const guidedPointerListId = inGuidedMode
    ? pickerState.invalidRequiredListIds[0] ?? null
    : null;

  // When the guided pointer advances (customer satisfied the current
  // section), scroll the next un-satisfied required list into view.
  // Triggers on every guidedPointerListId change while in guided mode.
  useEffect(() => {
    if (!inGuidedMode || !guidedPointerListId) return;
    const el = document.getElementById(
      modifierListFieldsetId(guidedPointerListId),
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [inGuidedMode, guidedPointerListId]);

  // Handler the Add button calls when there are still required
  // selections. Sticky-arms guided mode + scrolls to the first
  // un-satisfied section. The button stays clickable throughout —
  // tapping it again while already in guided mode just re-scrolls,
  // which is a useful "I lost the pointer, take me back" affordance.
  const enterGuidedMode = useCallback((): void => {
    const firstUnsatisfied = pickerState.invalidRequiredListIds[0];
    if (!firstUnsatisfied) return;
    setInGuidedMode(true);
    // Trigger an immediate scroll for the case where setInGuidedMode
    // doesn't change state (already true) — the useEffect above
    // wouldn't re-fire.
    const el = document.getElementById(
      modifierListFieldsetId(firstUnsatisfied),
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pickerState.invalidRequiredListIds]);

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
      // In Telegram fullscreen, clear the status bar + floating controls so
      // the image isn't cut off at the top. 0 on the web / desktop modal.
      style={{ paddingTop: "var(--tg-safe-top, 0px)" }}
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
      {/* data-tg-hide: inside Telegram, the native back/close + share controls
          already cover this, and they'd collide in the same top-right corner. */}
      <div data-tg-hide className="sticky top-0 z-20 h-0">
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
            competing. font-mono tabular-nums per DESIGN.md.
            Reads the SELECTED variation's price so it updates live as
            the customer toggles chips; single-variation items still
            show their one price unchanged. */}
        <p className="text-2xl font-mono font-semibold tabular-nums text-foreground">
          {formatPriceCents(effectivePriceCents, currencySettings)}
        </p>

        {/* Description only renders when the merchant actually wrote one.
            The previous "A detail view designed for immersive browsing…"
            placeholder leaked developer copy to customers. */}
        {localizedDescription && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {localizedDescription}
          </p>
        )}

        {/* Variation selector sits above the modifier picker because
            variation choice is the more fundamental decision (it
            changes price + flavor of the whole product); modifiers
            customise within a chosen variation. Returns null for
            single-variation items so the chrome is calm by default. */}
        {item.variations.length > 1 ? (
          <VariationSelector
            variations={item.variations}
            value={selectedVariationId}
            onChange={setSelectedVariationId}
            currencySettings={currencySettings}
            className="mt-2"
          />
        ) : null}

        {cart && hasVisibleModifierLists ? (
          <div className="mt-2">
            <ModifierPicker
              modifierLists={item.modifier_lists}
              onChange={handlePickerChange}
              formatPrice={(cents) => formatPriceCents(cents, currencySettings)}
              inGuidedMode={inGuidedMode}
              guidedPointerListId={guidedPointerListId}
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
        <div className="mx-auto flex w-full flex-col gap-3 px-5 pt-4 pb-[calc(1rem+var(--tg-safe-bottom,0px))]">
          {cart ? (
            <ItemDetailBottomCta
              cart={cart}
              itemId={item.id}
              itemName={localizedName}
              basePriceCents={effectivePriceCents}
              variationId={selectedVariation?.id}
              variationName={selectedVariationName}
              currencySettings={currencySettings}
              pickerState={pickerState}
              onEnterGuidedMode={enterGuidedMode}
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
// Bottom CTA — config-state-aware
//
// Two render states:
//
//   1. Current selections NOT in cart yet:
//          [           Add  •  $X.XX                ]
//      One primary CTA. Tapping commits qty=1 of the current config.
//      The "in-progress qty stepper" pattern (a separate counter
//      defaulting to 1 that lets the customer pre-multiply before
//      add) was removed — customers found it confusing when no
//      matching cart line existed yet, and qty>1 of the SAME custom
//      configuration is rare in practice. If they want more, they
//      tap Add, then bump via the stepper that appears in state 2.
//
//   2. Current selections MATCH a cart line:
//          [ 🗑 / − N + ]   [    In cart  ·  $X.XX     ]
//      The stepper operates directly on the matching cart line
//      (bumpQuantity / removeItem semantics). The right side shows
//      the in-cart line total + a passive "In cart" label so the
//      customer knows their changes are reflected in the cart.
//      Different modifier picks make state 1 reappear (creating a
//      new cart line on Add).
//
// Disabled / gated state (only applies to state 1):
//   * `pickerState.invalidRequiredCount > 0` → button disabled,
//     text reads "Make N required selection(s)". Tapping calls
//     onValidateBeforeAdd which scrolls the first unfilled required
//     list into view and flashes it.
// ──────────────────────────────────────────────────────────────────────

function ItemDetailBottomCta(props: {
  cart: NonNullable<ReturnType<typeof useOptionalCart>>;
  itemId: string;
  itemName: string;
  basePriceCents: number;
  /** Customer-selected variation. When undefined, the server resolves
   *  to the item's default variation. Both are valid — multi-variation
   *  items pass the chosen id; legacy single-variation items can omit. */
  variationId?: string;
  /** Display label for the variation. Shows up on cart line rows and
   *  receipts. Falls back to the variation row's snapshot name on the
   *  server if omitted. */
  variationName?: string | null;
  currencySettings: CurrencySettings | undefined;
  pickerState: ModifierPickerChange;
  /** Called when the customer taps the Add CTA while required
   *  selections are still un-satisfied. Promotes the detail into
   *  guided mode: scrolls to the first un-satisfied required list
   *  and arms the colored pill / orange border affordance in the
   *  picker. */
  onEnterGuidedMode: () => void;
  onClose?: () => void;
}) {
  const {
    cart,
    itemId,
    itemName,
    basePriceCents,
    variationId,
    variationName = null,
    currencySettings,
    pickerState,
    onEnterGuidedMode,
    onClose,
  } = props;
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  // Modifier signature for the customer's current selections. Must
  // match the server-side dedup logic in lib/cart/orders.ts byte-for-
  // byte so the matchingLine lookup below resolves correctly.
  const currentSignature = modifierSignature(
    pickerState.selections.map((s) => ({
      listId: s.modifierListId,
      modifierId: s.modifierId,
      quantity: s.quantity,
      text_value: s.text_value,
    })),
  );

  // Look for an existing cart line whose (item, variation, modifier
  // signature) exactly matches the current selections. When found, we
  // render the stepper variant instead of the Add button.
  //
  // Variation match: when the caller passed a variationId (multi-
  // variation items), require an exact match so different variations
  // stay as different cart lines. When undefined (single-variation /
  // legacy), accept any variation — the server resolves to the item's
  // default and the optimistic placeholder uses null, so a strict
  // compare would flash the stepper off the moment the server response
  // overwrites the placeholder with the real default-variation row.
  const matchingLine = cart.summary.lineItems.find((line) => {
    if (line.catalog_item_id !== itemId) return false;
    if (
      variationId !== undefined &&
      line.catalog_variation_id !== variationId
    ) {
      return false;
    }
    const lineSig = modifierSignature(
      line.modifiers
        .filter((m) => m.catalog_modifier_list_id !== null)
        .map((m) => ({
          listId: m.catalog_modifier_list_id as string,
          modifierId: m.catalog_modifier_id,
          quantity: m.quantity,
          text_value: m.text_value,
        })),
    );
    return lineSig === currentSignature;
  });

  // Running unit price for the Add CTA = base + sum(modifier deltas × qty).
  const modifierDeltaCents = pickerState.selections.reduce(
    (sum, sel) => sum + sel.basePriceCentsDelta * sel.quantity,
    0,
  );
  const unitPriceCents = basePriceCents + modifierDeltaCents;

  const requiredCount = pickerState.invalidRequiredCount;
  const isGated = requiredCount > 0;

  const handleAdd = async () => {
    // Gated state: customer tapped the CTA while required selections
    // are pending. Don't add to cart — instead, enter guided mode and
    // scroll to the first un-satisfied required list. The button copy
    // stays "Make N required selections" until the customer satisfies
    // every required modifier.
    if (isGated) {
      onEnterGuidedMode();
      return;
    }
    try {
      await cart.addItem({
        itemId,
        // Variation threading: when present, sent to the server so it
        // resolves to the customer's chosen variation instead of the
        // item's default. The variation also drives the dedup key so
        // two different variations of the same item land as distinct
        // cart lines (Square / DoorDash parity).
        variationId,
        variationName,
        name: itemName,
        basePriceCents,
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
      // No auto-close — Kcal/Careem don't either; once added, the CTA
      // flips to the stepper variant so the customer can bump/remove
      // this configuration without leaving the detail.
    } catch {
      // cart-provider toasts the error already.
    }
  };

  // ── State 2: current selections already in cart ───────────────────
  // Stepper drives the existing cart line directly (no in-progress qty
  // intermediation). + bumps; − decrements; trash (at qty 1) removes
  // the line. The right-side label confirms the line total so the
  // customer sees their state without opening the cart drawer.
  if (matchingLine) {
    const inCartTotal = matchingLine.total_price_cents;
    return (
      <div className="flex w-full items-stretch gap-3">
        <CartStepper
          variant="detail"
          quantity={matchingLine.quantity}
          itemName={itemName}
          onDecrement={() => cart.bumpQuantity(matchingLine.id, -1)}
          onIncrement={() => cart.bumpQuantity(matchingLine.id, +1)}
        />

        {/* Passive "in cart" indicator with running line total.
            Tappable — opens the cart drawer so the customer can review
            and continue. Outline variant so it doesn't read as a
            primary CTA. */}
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => cart.open()}
          className="h-11 min-w-0 flex-1 text-sm font-semibold tabular-nums"
        >
          <ShoppingCart className="mr-2 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {t("add_to_cart.view")}
            {" · "}
            {formatPriceCents(inCartTotal, currencySettings)}
          </span>
        </Button>
      </div>
    );
  }

  // ── State 1: current selections NOT in cart yet ───────────────────
  // Single full-width Add CTA. Gated state swaps copy + disables.
  const addButtonLabel = isGated
    ? requiredCount === 1
      ? t("add_to_cart.gated_required_one")
      : t("add_to_cart.gated_required_many", { count: requiredCount })
    : t("add_to_cart.label_with_price", {
        price: formatPriceCents(unitPriceCents, currencySettings),
      });

  return (
    <Button
      type="button"
      size="lg"
      onClick={handleAdd}
      // Always clickable. The gated state's onClick routes through
      // onEnterGuidedMode instead of cart.addItem (see handleAdd above).
      className="h-11 w-full min-w-0 text-sm font-semibold tabular-nums"
    >
      <ShoppingCart className="mr-2 size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{addButtonLabel}</span>
    </Button>
  );
}
