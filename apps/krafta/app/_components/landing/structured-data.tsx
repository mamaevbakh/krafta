import type { LandingLocale } from "./content";

const SITE_URL = "https://www.krafta.uz";

/**
 * JSON-LD structured data for the marketing landing. Two entities in one graph:
 *
 *  - Organization: the Krafta brand entity (name, logo, who it serves) — the
 *    node search + AI engines attach everything else to.
 *  - SoftwareApplication: what Krafta *is* (a business app) with its real price
 *    tiers, so Google can show pricing rich results and ChatGPT / Perplexity /
 *    Google AI Overviews can answer "what is Krafta / how much is it" correctly.
 *
 * Rendered as a <script type="application/ld+json"> in the page body — Google
 * reads it anywhere in the document. Description is passed in so it matches the
 * page's active locale (single source with the <title>/meta in page.tsx).
 */
export function LandingJsonLd({
  locale,
  description,
}: {
  locale: LandingLocale;
  description: string;
}) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Krafta",
        url: SITE_URL,
        logo: `${SITE_URL}/og-image`,
        image: `${SITE_URL}/og-image`,
        description,
        areaServed: { "@type": "Country", name: "Uzbekistan" },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "Krafta",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: locale,
        description,
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: [
          {
            "@type": "Offer",
            name: "Free",
            price: "0",
            priceCurrency: "UZS",
          },
          {
            "@type": "Offer",
            name: "Pro",
            price: "250000",
            priceCurrency: "UZS",
          },
          {
            "@type": "Offer",
            name: "Business",
            price: "490000",
            priceCurrency: "UZS",
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Structured data is our own trusted, static content — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
