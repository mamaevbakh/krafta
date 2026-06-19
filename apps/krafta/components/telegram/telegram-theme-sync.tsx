"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import {
  getColorScheme,
  getWebApp,
  isTelegramMiniApp,
} from "@/lib/telegram/webapp";

/**
 * TelegramThemeSync — inside a Mini App, force the storefront's light/dark to
 * track the user's Telegram theme.
 *
 * We sync the MODE only (next-themes setTheme → "light" | "dark") and keep
 * Krafta's own zinc palette — we deliberately do NOT adopt Telegram's
 * themeParams colors (DESIGN.md: brutally minimal, zinc monochrome). Relying on
 * `system` / prefers-color-scheme alone is unreliable inside the Telegram
 * webview and misses a live in-app theme switch, so we read `colorScheme`
 * explicitly and re-sync on the `themeChanged` event.
 *
 * No-op on the public web — there the user's own toggle / system preference
 * stays in charge.
 */
export function TelegramThemeSync() {
  const { setTheme } = useTheme();

  React.useEffect(() => {
    const wa = getWebApp();
    if (!wa || !isTelegramMiniApp()) return;

    const apply = () => {
      const scheme = getColorScheme();
      if (scheme) setTheme(scheme);
    };

    apply();
    wa.onEvent?.("themeChanged", apply);
    return () => wa.offEvent?.("themeChanged", apply);
  }, [setTheme]);

  return null;
}
