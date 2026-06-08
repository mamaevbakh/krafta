"use client";

import * as React from "react";

import {
  getWebApp,
  isTelegramMiniApp,
  tgVersionAtLeast,
  type TgInsets,
} from "@/lib/telegram/webapp";

/**
 * TelegramFrame — one-time Mini App frame setup, mounted once in the storefront.
 *
 * Inside Telegram it: marks the app ready, goes fullscreen (8.0+, else expand),
 * disables the swipe-to-minimize gesture (so vaul drawers don't accidentally
 * close the app), and publishes the safe-area + content-safe-area insets as CSS
 * variables (`--tg-safe-top/-bottom/-left/-right`) that the storefront chrome
 * pads against. Re-applies on safe-area / fullscreen change. No-ops on the web.
 */
export function TelegramFrame() {
  React.useEffect(() => {
    const wa = getWebApp();
    if (!wa || !isTelegramMiniApp()) return;

    try {
      wa.ready();
    } catch {
      /* already ready */
    }

    // Fullscreen for the app-like feel; fall back to plain expand on <8.0.
    if (tgVersionAtLeast("8.0") && wa.requestFullscreen) {
      try {
        wa.requestFullscreen();
      } catch {
        wa.expand?.();
      }
    } else {
      wa.expand?.();
    }

    // Our gestures (drawer drag, horizontal swipes) must not be read as
    // minimize-the-app. Does not block normal scrolling.
    wa.disableVerticalSwipes?.();

    const root = document.documentElement;
    // Marker class so the storefront can hide chrome that Telegram already
    // provides (its own back/close/share) and offset sticky elements.
    root.classList.add("tg-app");
    const zero: TgInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    const applyInsets = () => {
      const s = wa.safeAreaInset ?? zero;
      const c = wa.contentSafeAreaInset ?? zero;
      root.style.setProperty("--tg-safe-top", `${(s.top ?? 0) + (c.top ?? 0)}px`);
      root.style.setProperty(
        "--tg-safe-bottom",
        `${(s.bottom ?? 0) + (c.bottom ?? 0)}px`,
      );
      root.style.setProperty("--tg-safe-left", `${(s.left ?? 0) + (c.left ?? 0)}px`);
      root.style.setProperty(
        "--tg-safe-right",
        `${(s.right ?? 0) + (c.right ?? 0)}px`,
      );
    };

    applyInsets();
    wa.onEvent?.("safeAreaChanged", applyInsets);
    wa.onEvent?.("contentSafeAreaChanged", applyInsets);
    wa.onEvent?.("fullscreenChanged", applyInsets);

    return () => {
      wa.offEvent?.("safeAreaChanged", applyInsets);
      wa.offEvent?.("contentSafeAreaChanged", applyInsets);
      wa.offEvent?.("fullscreenChanged", applyInsets);
      root.classList.remove("tg-app");
    };
  }, []);

  return null;
}
