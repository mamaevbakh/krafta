"use client";

import * as React from "react";

import { useOptionalCart } from "@/components/catalogs/cart/cart-provider";
import { useOptionalItemSheet } from "@/components/catalogs/items/item-detail-controller";
import { useTelegramMainButton } from "@/components/telegram/use-telegram-main-button";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { getWebApp } from "@/lib/telegram/webapp";

/**
 * Cart-derived Telegram surfaces, mounted inside the storefront tree (so it
 * sees both the cart and item-sheet contexts). Two jobs:
 *
 *  • MainButton — a native bottom "View cart · total" CTA while the customer is
 *    browsing (cart non-empty, no overlay open). It hides when the cart drawer
 *    or item sheet is open, since those own their own in-sheet CTAs.
 *  • Closing confirmation — armed whenever the cart has items, so an accidental
 *    swipe-down / close doesn't silently drop an in-progress order.
 *
 * All of it no-ops on the public web (the underlying SDK calls are guarded).
 */
export function TelegramCartButton({
  currencySettings = defaultCurrencySettings,
}: {
  currencySettings?: CurrencySettings;
}) {
  const cart = useOptionalCart();
  const sheet = useOptionalItemSheet();
  const { activeLocale, defaultLocale } = useStorefrontLocale();

  const itemCount = cart?.itemCount ?? 0;
  const subtotalCents = cart?.summary.subtotalCents ?? 0;
  const overlayOpen = (cart?.isOpen ?? false) || (sheet?.isOpen ?? false);

  const label = getStorefrontMessage("add_to_cart.view", {
    activeLocale,
    defaultLocale,
  });
  const price = formatPriceCents(subtotalCents, currencySettings);

  useTelegramMainButton(
    cart
      ? {
          visible: itemCount > 0 && !overlayOpen,
          text: `${label} · ${price}`,
          onClick: () => cart.open(),
        }
      : null,
  );

  // Closing confirmation mirrors "cart has items".
  const hasItems = itemCount > 0;
  React.useEffect(() => {
    const wa = getWebApp();
    if (!wa?.enableClosingConfirmation) return;
    if (hasItems) wa.enableClosingConfirmation();
    else wa.disableClosingConfirmation?.();
  }, [hasItems]);

  return null;
}
