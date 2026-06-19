"use client";

import * as React from "react";

import { useOptionalCart } from "@/components/catalogs/cart/cart-provider";
import { getWebApp } from "@/lib/telegram/webapp";

/**
 * TelegramCartButton — closing-confirmation guard. Armed whenever the cart has
 * items, so an accidental swipe-down / close inside Telegram doesn't silently
 * drop an in-progress order.
 *
 * (The native MainButton "View cart · total" was removed: it was only wired for
 * browsing, never the in-drawer checkout/place-order steps, so the in-app dock
 * + cart drawer own the whole flow instead.) No-ops on the public web.
 */
export function TelegramCartButton() {
  const cart = useOptionalCart();
  const hasItems = (cart?.itemCount ?? 0) > 0;

  React.useEffect(() => {
    const wa = getWebApp();
    if (!wa?.enableClosingConfirmation) return;
    if (hasItems) wa.enableClosingConfirmation();
    else wa.disableClosingConfirmation?.();
  }, [hasItems]);

  return null;
}
