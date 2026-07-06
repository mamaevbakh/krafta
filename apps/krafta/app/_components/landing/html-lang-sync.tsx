"use client";

import { useEffect } from "react";

import type { LandingLocale } from "./content";

/**
 * Sync <html lang> to the landing's active locale, client-side.
 *
 * Next.js allows a single <html> tag (root layout, shared by the dashboard +
 * storefronts), and with cacheComponents on, reading request data there to
 * vary the SSR lang would break static prerendering app-wide. So the SSR tag
 * stays the app default ("en") and we correct it after hydration — enough for
 * screen readers to pronounce the served language correctly. Search-engine
 * language targeting does NOT depend on this: hreflang + per-language canonical
 * (page.tsx) are the signals Google/Yandex actually use, and those are already
 * correct in the SSR output. This is an accessibility nicety, not the SEO fix.
 */
export function HtmlLangSync({ locale }: { locale: LandingLocale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
