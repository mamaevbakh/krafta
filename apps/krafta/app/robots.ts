import type { MetadataRoute } from "next";

// Canonical public host. The site also answers on krafta.org / krafta.company
// (both 301-redirect here in proxy.ts), but every page canonicalizes to
// www.krafta.uz — the .uz ccTLD is the primary for the Uzbekistan market, and
// the Yandex `Host` directive below names it as the canonical mirror.
const SITE_URL = "https://www.krafta.uz";

/**
 * /robots.txt — tells crawlers what to crawl and where the sitemap is.
 *
 * Allow the public surface (marketing landing + customer storefronts) and
 * keep crawlers out of the merchant admin and machinery: the dashboard, auth,
 * API, QR-redirect shortlinks, the Telegram Mini App entry, and dev/preview
 * routes have no search value and shouldn't burn crawl budget.
 *
 * NOTE: /login and /onboarding are deliberately NOT disallowed here — they
 * carry a `noindex` meta tag instead. A disallowed page can't be crawled, so
 * Google never sees its noindex and may keep a URL-only listing; letting them
 * be crawled lets the noindex fully drop them from the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/auth/",
          "/preview/",
          "/tma",
          "/lab/",
          "/q/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Yandex-specific: names the canonical mirror among the .org/.uz/.company
    // domains. Ignored by Google (which uses the canonical tags), honored by
    // Yandex — important for the Uzbek/CIS market.
    host: SITE_URL,
  };
}
