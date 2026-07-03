import { ImageResponse } from "next/og";

/**
 * Social-share card for the marketing landing (krafta.org). Referenced
 * explicitly by app/page.tsx's openGraph.images — deliberately NOT the
 * cascading `opengraph-image` file convention, so customer storefronts
 * (/[slug]) stay bare and never unfurl as generic Krafta branding.
 *
 * Brand-true minimal: near-black field, white wordmark, one muted spec line.
 * No gradients, no decoration (DESIGN.md).
 *
 * (No `export const dynamic` — cacheComponents forbids route-segment config;
 * the handler has no request-dynamic data, so it caches naturally.)
 */

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#09090b",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "#fafafa",
            lineHeight: 1,
          }}
        >
          Krafta
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 44,
            fontWeight: 500,
            color: "#a1a1aa",
            maxWidth: 900,
            lineHeight: 1.25,
          }}
        >
          Storefront, orders & QR menu for cafes and shops. No commission.
        </div>
        <div
          style={{
            marginTop: 56,
            fontSize: 26,
            letterSpacing: "0.22em",
            color: "#71717a",
            textTransform: "uppercase",
          }}
        >
          Storefront · Orders · QR · Payments
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
