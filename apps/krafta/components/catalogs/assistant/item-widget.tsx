"use client";

import * as React from "react";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";

import type { PublicItem } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";
import { useOptionalCart } from "@/components/catalogs/cart/cart-provider";
import { VariationSelector } from "@/components/catalogs/items/variation-selector";
import {
  ModifierPicker,
  type ModifierPickerChange,
} from "@/components/catalogs/items/modifier-picker";

/**
 * In-assistant item configurator — the §2.2 "Item widget". Renders as an
 * overlay inside the assistant dialog so the shopper can pick a variation +
 * visible modifiers and add a fully-configured line WITHOUT the full-screen
 * sheet. Reuses the storefront's VariationSelector + ModifierPicker (both
 * controlled + self-localizing) so the running price, validation, and the
 * cart.addItem payload match the main item sheet exactly.
 *
 * `onAdded` fires after a successful add; the caller decides whether to go
 * back to the chat ("Add to cart") or straight to checkout ("Оформить заказ").
 */
export function ItemWidget({
  item,
  currency,
  onBack,
  onAdded,
}: {
  item: PublicItem;
  currency: CurrencySettings;
  onBack: () => void;
  onAdded: (next: "back" | "checkout") => void;
}) {
  const cart = useOptionalCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = React.useCallback(
    (key: StorefrontMessageKey, vars?: Record<string, string | number>) =>
      getStorefrontMessage(key, { activeLocale, defaultLocale, vars }),
    [activeLocale, defaultLocale],
  );

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
  const imageUrl = getItemImageUrl(item);

  const defaultVariation =
    item.variations.find((v) => v.is_default) ?? item.variations[0];
  const [variationId, setVariationId] = React.useState<string>(
    defaultVariation?.id ?? "",
  );
  const selectedVariation =
    item.variations.find((v) => v.id === variationId) ?? defaultVariation;
  const [qty, setQty] = React.useState(1);
  const [picker, setPicker] = React.useState<ModifierPickerChange>({
    selections: [],
    isValid: true,
    firstInvalidListId: null,
    invalidRequiredListIds: [],
    invalidRequiredCount: 0,
  });
  const [adding, setAdding] = React.useState(false);

  const basePriceCents = selectedVariation?.price_cents ?? item.price_cents;
  const modifierDelta = picker.selections.reduce(
    (sum, s) => sum + s.basePriceCentsDelta * s.quantity,
    0,
  );
  const perUnitCents = basePriceCents + modifierDelta;
  const totalCents = perUnitCents * qty;

  const requiredRemaining = picker.invalidRequiredCount;
  const canAdd = !!cart && !!selectedVariation && requiredRemaining === 0;

  const add = async () => {
    if (!cart || !selectedVariation) return;
    setAdding(true);
    try {
      await cart.addItem({
        itemId: item.id,
        variationId: selectedVariation.id,
        variationName: selectedVariation.name,
        basePriceCents,
        quantity: qty,
        name: localizedName,
        modifiers: picker.selections.map((s) => ({
          modifierListId: s.modifierListId,
          modifierId: s.modifierId,
          quantity: s.quantity,
          name: s.name,
          basePriceCentsDelta: s.basePriceCentsDelta,
          text_value: s.text_value,
        })),
      });
    } finally {
      setAdding(false);
    }
  };

  const primaryLabel =
    requiredRemaining === 1
      ? t("add_to_cart.gated_required_one")
      : requiredRemaining > 1
        ? t("add_to_cart.gated_required_many", { count: requiredRemaining })
        : t("add_to_cart.label_with_price", {
            price: formatPriceCents(totalCents, currency),
          });

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← {t("checkout.back")}
        </button>
        <span className="w-12" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        <div className="mx-auto max-w-md space-y-4">
          {imageUrl ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
              <Image
                src={imageUrl}
                alt={localizedImageAlt ?? localizedName}
                fill
                sizes="(max-width: 640px) 100vw, 448px"
                className="object-cover"
              />
            </div>
          ) : null}

          <div>
            <h2 className="text-lg font-semibold leading-tight">
              {localizedName}
            </h2>
            {localizedDescription ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {localizedDescription}
              </p>
            ) : null}
          </div>

          <VariationSelector
            variations={item.variations}
            value={variationId}
            onChange={setVariationId}
          />

          {item.modifier_lists.length > 0 ? (
            <ModifierPicker
              modifierLists={item.modifier_lists}
              onChange={setPicker}
              formatPrice={(cents) => formatPriceCents(cents, currency)}
            />
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-border">
            <button
              type="button"
              aria-label="Decrease"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid size-8 place-items-center rounded-full text-foreground transition hover:bg-muted"
            >
              <Minus className="size-4" />
            </button>
            <span className="min-w-5 text-center text-sm font-semibold tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Increase"
              onClick={() => setQty((q) => q + 1)}
              className="grid size-8 place-items-center rounded-full text-foreground transition hover:bg-muted"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div className="ml-auto font-mono text-base font-semibold tabular-nums">
            {formatPriceCents(totalCents, currency)}
          </div>
        </div>

        <div className="mx-auto mt-3 max-w-md space-y-2">
          <button
            type="button"
            disabled={!canAdd || adding}
            onClick={async () => {
              await add();
              onAdded("back");
            }}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            disabled={!canAdd || adding}
            onClick={async () => {
              await add();
              onAdded("checkout");
            }}
            className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-40"
          >
            {t("checkout.place_order")}
          </button>
        </div>
      </div>
    </div>
  );
}
