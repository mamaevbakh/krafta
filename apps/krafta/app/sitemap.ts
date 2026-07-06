import type { MetadataRoute } from "next";

const SITE_URL = "https://www.krafta.org";

// Fixed lastmod (updated deliberately, not on every build) — a per-build
// `new Date()` would churn the timestamp and train crawlers to distrust it.
const LAST_MODIFIED = "2026-07-06";

/**
 * /sitemap.xml — the URLs we want indexed. For now that's OUR marketing
 * landing plus its three language variants (mirrors the hreflang cluster in
 * app/page.tsx so crawlers see the same language map from both signals).
 *
 * Customer storefronts (/[slug]) are deliberately NOT enumerated here — that
 * would need a DB query over every published shop and per-shop metadata we've
 * chosen not to build yet. They stay crawlable (robots allows them); they're
 * just not advertised in our sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          ru: `${SITE_URL}/?lang=ru`,
          uz: `${SITE_URL}/?lang=uz`,
          en: `${SITE_URL}/?lang=en`,
        },
      },
    },
  ];
}
