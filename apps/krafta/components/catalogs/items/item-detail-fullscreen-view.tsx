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
 *   • Image capped at 55dvh + object-cover, replacing the prior
 *     "AspectRatio expands until viewport runs out" behavior. A 9:16
 *     image on a 375pt phone used to consume the whole viewport,
 *     pushing the price below the fold. Now the price is always above
 *     the fold; merchants lose some top/bottom crop on tall images,
 *     which is the right trade for commerce.
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
 *     swipe-back zone. Backdrop-blur + 85% opaque background keeps
 *     them readable over the image AND over the body in both light
 *     and dark modes — no contrast switch needed.
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
import { Share2, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ItemDetailProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { AddToCartButton, useOptionalCart } from "@/components/catalogs/cart";
import {
  ModifierPicker,
  modifierListFieldsetId,
  type ModifierPickerChange,
} from "@/components/catalogs/items/modifier-picker";

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
      className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-y-auto bg-background text-foreground md:h-[85dvh] md:rounded-sm md:shadow-xl"
    >
      {/* Floating chrome — Share + Close. The outer sticky div has
          h-0 + no background so it takes ZERO vertical space; the
          image starts edge-to-edge from the top of the modal. The
          buttons are absolutely positioned inside the anchor so they
          stay pinned to the top-right corner as the customer scrolls.
          Glassmorphic style (bg-background/85 + backdrop-blur-md +
          shadow-sm) so they read cleanly over the image OR the body,
          in light OR dark mode. */}
      <div className="sticky top-0 z-20 h-0">
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleShare}
            className="h-10 w-10 rounded-full border-border/40 bg-background/85 shadow-sm backdrop-blur-md"
            aria-label="Share"
          >
            <Share2 className="size-4" />
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 rounded-full border-border/40 bg-background/85 shadow-sm backdrop-blur-md"
              aria-label={closeLabelFor(activeLocale)}
            >
              <XIcon className="size-5" />
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-border/40 bg-background/85 shadow-sm backdrop-blur-md"
            >
              <Link href={backHref ?? "#"} aria-label={closeLabelFor(activeLocale)}>
                <XIcon className="size-5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Image — capped at 55dvh. The aspect ratio is honored UP TO
          that cap; taller-than-cap images get cropped top/bottom via
          object-cover so the layout doesn't push critical info off-
          screen. The image area is skipped entirely when no imageUrl —
          the body starts immediately below the header. */}
      {imageUrl && (
        <div
          className="relative w-full overflow-hidden bg-muted"
          style={{
            aspectRatio: ratio,
            maxHeight: "55dvh",
          }}
        >
          <Image
            src={imageUrl}
            alt={localizedImageAlt ?? localizedName}
            fill
            sizes="(max-width: 640px) 100vw, 480px"
            className="h-full w-full object-cover"
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

      {/* Sticky CTA — Add to cart (cart context present) or Close
          (browsing without cart). On mobile this stays visually
          anchored to the bottom via sticky; on desktop the same. */}
      <div className="sticky bottom-0 z-10 mt-auto w-full border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full flex-col gap-3 px-5 py-4">
          {cart ? (
            <AddToCartButton
              itemId={item.id}
              itemName={localizedName}
              basePriceCents={item.price_cents}
              modifiers={pickerState.selections}
              // Always enabled visually. The button calls preFlight first;
              // if it returns false, the add is suppressed and the
              // customer's eye is scrolled to the unfilled required list.
              preFlight={validateBeforeAdd}
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
