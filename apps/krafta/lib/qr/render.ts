/**
 * QR code rendering — SVG output with an optional centered Krafta wordmark.
 *
 * Why SVG (not PNG): vector scales infinitely for print without
 * pixelation; the merchant can scale a single asset to a table-tent or
 * a poster without us having to ship different sizes. PNG for downloads
 * is rasterized separately (via @resvg/resvg-js on the server route,
 * or via the browser's canvas for per-card downloads).
 *
 * Logo overlay reliability — we render the QR at error-correction level
 * H (~30% damage tolerance) and white-out a centered square ~22% of the
 * QR's side. Industry rule-of-thumb is that overlay area should stay
 * under 25-30% with EC level H to keep scans reliable; we sit comfortably
 * below that. The Krafta wordmark renders as inline SVG `<text>` in
 * Helvetica Neue Bold (per DESIGN.md) so we don't ship a font file.
 *
 * Public surface:
 *   renderQrSvg(url, opts?) → SVG string ready to drop into `dangerouslySetInnerHTML`
 *                              or to feed @resvg/resvg-js for PNG export.
 */

import QRCode from "qrcode";

export type RenderQrOptions = {
  /** Outer SVG canvas size in pixels. Default 320. Vector — only affects
   *  viewBox / intrinsic size hints, not actual print resolution. */
  size?: number;
  /** Show the centered Krafta wordmark. Default true. */
  withWordmark?: boolean;
  /** Wordmark text. Default "Krafta". */
  wordmark?: string;
};

/**
 * Render a QR code as a self-contained SVG string with an optional
 * centered Krafta wordmark overlay.
 *
 * The QR uses error-correction level H (~30% recovery) so the wordmark
 * cutout doesn't break scannability. The cutout itself is a rounded
 * white rectangle sized to ~22% of the QR's side — well within the
 * level-H tolerance budget.
 */
export async function renderQrSvg(
  url: string,
  opts: RenderQrOptions = {},
): Promise<string> {
  const size = opts.size ?? 320;
  const withWordmark = opts.withWordmark ?? true;
  const wordmark = opts.wordmark ?? "Krafta";

  // qrcode.toString returns a complete SVG document. We pull its
  // <path> data out and re-wrap so we have full control of the SVG
  // chrome (viewBox, the wordmark overlay, font styles).
  const rawSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  // Pull the QR module count out of the generated SVG's viewBox so the
  // overlay math stays correct across short / long URLs (URL length
  // changes the QR's module count, which changes its visual density).
  const viewBoxMatch = rawSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const moduleCount = viewBoxMatch ? Number(viewBoxMatch[1]) : 33;

  // Wordmark cutout: ~22% of the QR's side. Square cutout reads cleaner
  // against the QR pattern than a circle does at this size.
  const cutoutSide = Math.round(moduleCount * 0.22);
  const cutoutXY = Math.round((moduleCount - cutoutSide) / 2);
  // Text height ~ 60% of the cutout so there's breathing room. Helvetica
  // Neue Bold (DESIGN.md wordmark) — falls back to Helvetica then system
  // sans on machines without the typeface installed.
  const textHeight = Math.round(cutoutSide * 0.6);

  // Extract just the QR module <path> from the generated SVG. qrcode
  // emits a single `<path stroke="...">` for the dark modules.
  const pathMatch = rawSvg.match(/<path[^>]+\/>/);
  const qrPath = pathMatch ? pathMatch[0] : "";

  const wordmarkOverlay = withWordmark
    ? `
    <!-- Wordmark cutout: white rounded rectangle + Krafta text. EC level H
         lets us hide ~30% of modules; we sit at ~22% comfortably. -->
    <rect x="${cutoutXY}" y="${cutoutXY}" width="${cutoutSide}" height="${cutoutSide}" rx="0.6" fill="#FFFFFF"/>
    <text
      x="${moduleCount / 2}"
      y="${moduleCount / 2}"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
      font-weight="700"
      font-size="${textHeight * 0.45}"
      fill="#000000"
      letter-spacing="-0.02em"
    >${escapeXml(wordmark)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${moduleCount} ${moduleCount}" width="${size}" height="${size}" shape-rendering="crispEdges">
    ${qrPath}${wordmarkOverlay}
  </svg>`;
}

/** Minimal XML escape for the wordmark text (defensive — Krafta has no
 *  special chars but a future override might). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
