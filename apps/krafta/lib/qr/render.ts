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
  /** Wordmark text. Pass to override the default "Krafta" vector path
   *  with arbitrary text. The override falls back to an `<text>` element
   *  rendered in the browser's font stack — only the default "Krafta"
   *  string gets the embedded vector path. */
  wordmark?: string;
};

/**
 * Hard-coded SVG path for "Krafta" in Helvetica Neue Bold (the project's
 * brand wordmark font, `public/fonts/helveticaneue-bold.woff2`).
 *
 * Why pre-baked as a vector path: a `<text>` element depends on the
 * renderer having the font installed. Browsers fall back to Arial /
 * DejaVu; @resvg/resvg-js on Vercel's Linux runtime can't load woff2
 * without a font-loading config; the per-card PNG download path uses
 * browser canvas, which can't read SVG `@font-face` data URLs at all
 * (security restriction on Image() resource loading).
 *
 * Solution: render once via opentype.js + wawoff2 at design time and
 * inline the result. The path is ~3 KB of glyph data, scales to any size,
 * renders identically across every consumer (dashboard preview, browser
 * canvas PNG, server Resvg PNG).
 *
 * Bounds (at the source font-size of 100): x ∈ [6.9, 290.6], y ∈
 * [-71.4, 1.3]. We translate by -147.2 / +35.05 to center the bbox on
 * the SVG origin before scaling.
 *
 * To regenerate (e.g. if BrandWordmark changes font, weight, or text):
 *
 *   pnpm --filter krafta add -D opentype.js wawoff2
 *   node --input-type=module -e "
 *     import { readFileSync } from 'node:fs';
 *     import opentype from 'opentype.js';
 *     import wawoff from 'wawoff2';
 *     const ttf = await wawoff.decompress(readFileSync('./public/fonts/helveticaneue-bold.woff2'));
 *     const font = opentype.parse(new Uint8Array(ttf).buffer);
 *     let x = 0, cmds = [];
 *     for (const ch of 'Krafta') {
 *       const g = font.charToGlyph(ch);
 *       cmds.push(...g.getPath(x, 0, 100).commands);
 *       x += g.advanceWidth * 100 / font.unitsPerEm;
 *     }
 *     const f = n => isFinite(n) ? +n.toFixed(3) : 0;
 *     console.log(cmds.map(c => c.type === 'Z' ? 'Z' : c.type +
 *       (c.x1 != null ? ' ' + f(c.x1) + ' ' + f(c.y1) : '') +
 *       (c.x2 != null ? ' ' + f(c.x2) + ' ' + f(c.y2) : '') +
 *       ' ' + f(c.x) + ' ' + f(c.y)).join(''));
 *   "
 *   pnpm --filter krafta remove opentype.js wawoff2
 *
 * Then paste the output into KRAFTA_WORDMARK_PATH below.
 */
const KRAFTA_WORDMARK_PATH =
  "M22.6 -71.4L6.9 -71.4L6.9 0L22.6 0L22.6 -23L31.6 -32.1L53.1 0L72.8 0L42.2 -43.2L70.1 -71.4L50.5 -71.4L22.6 -41.8L22.6 -71.4M91.1 -51.7L77.6 -51.7L77.6 0L91.8 0L91.8 -23.3Q91.8 -26.8 92.5 -29.8Q93.2 -32.8 94.85 -35.05Q96.5 -37.3 99.2 -38.6Q101.9 -39.9 105.8 -39.9L105.8 -39.9Q107.1 -39.9 108.5 -39.75Q109.9 -39.6 110.9 -39.4L110.9 -39.4L110.9 -52.6Q109.2 -53.1 107.8 -53.1L107.8 -53.1Q105.1 -53.1 102.6 -52.3Q100.1 -51.5 97.9 -50.05Q95.7 -48.6 94 -46.55Q92.3 -44.5 91.3 -42.1L91.3 -42.1L91.1 -42.1L91.1 -51.7M130.1 -35.8L115.9 -35.8Q116.2 -40.8 118.4 -44.1Q120.6 -47.4 124 -49.4Q127.4 -51.4 131.65 -52.25Q135.9 -53.1 140.2 -53.1L140.2 -53.1Q144.1 -53.1 148.1 -52.55Q152.1 -52 155.4 -50.4Q158.7 -48.8 160.8 -45.95Q162.9 -43.1 162.9 -38.4L162.9 -38.4L162.9 -11.5Q162.9 -8 163.3 -4.8Q163.7 -1.6 164.7 0L164.7 0L150.3 0Q149.9 -1.2 149.65 -2.45Q149.4 -3.7 149.3 -5L149.3 -5Q145.9 -1.5 141.3 -0.1Q136.7 1.3 131.9 1.3L131.9 1.3Q128.2 1.3 125 0.4Q121.8 -0.5 119.4 -2.4Q117 -4.3 115.65 -7.2Q114.3 -10.1 114.3 -14.1L114.3 -14.1Q114.3 -18.5 115.85 -21.35Q117.4 -24.2 119.85 -25.9Q122.3 -27.6 125.45 -28.45Q128.6 -29.3 131.8 -29.8Q135 -30.3 138.1 -30.6Q141.2 -30.9 143.6 -31.5Q146 -32.1 147.4 -33.25Q148.8 -34.4 148.7 -36.6L148.7 -36.6Q148.7 -38.9 147.95 -40.25Q147.2 -41.6 145.95 -42.35Q144.7 -43.1 143.05 -43.35Q141.4 -43.6 139.5 -43.6L139.5 -43.6Q135.3 -43.6 132.9 -41.8Q130.5 -40 130.1 -35.8L130.1 -35.8M148.7 -20L148.7 -25.3Q147.8 -24.5 146.45 -24.05Q145.1 -23.6 143.55 -23.3Q142 -23 140.3 -22.8Q138.6 -22.6 136.9 -22.3L136.9 -22.3Q135.3 -22 133.75 -21.5Q132.2 -21 131.05 -20.15Q129.9 -19.3 129.2 -18Q128.5 -16.7 128.5 -14.7L128.5 -14.7Q128.5 -12.8 129.2 -11.5Q129.9 -10.2 131.1 -9.45Q132.3 -8.7 133.9 -8.4Q135.5 -8.1 137.2 -8.1L137.2 -8.1Q141.4 -8.1 143.7 -9.5Q146 -10.9 147.1 -12.85Q148.2 -14.8 148.45 -16.8Q148.7 -18.8 148.7 -20L148.7 -20M168.5 -42.2L177 -42.2L177 0L191.2 0L191.2 -42.2L201 -42.2L201 -51.7L191.2 -51.7L191.2 -54.8Q191.2 -58 192.45 -59.35Q193.7 -60.7 196.6 -60.7L196.6 -60.7Q199.3 -60.7 201.8 -60.4L201.8 -60.4L201.8 -71Q200 -71.1 198.1 -71.25Q196.2 -71.4 194.3 -71.4L194.3 -71.4Q185.6 -71.4 181.3 -67Q177 -62.6 177 -55.7L177 -55.7L177 -51.7L168.5 -51.7L168.5 -42.2M235.6 -51.7L225.2 -51.7L225.2 -67.2L211 -67.2L211 -51.7L202.4 -51.7L202.4 -42.2L211 -42.2L211 -11.7Q211 -7.8 212.3 -5.4Q213.6 -3 215.85 -1.7Q218.1 -0.4 221.05 0.05Q224 0.5 227.3 0.5L227.3 0.5Q229.4 0.5 231.6 0.4Q233.8 0.3 235.6 0L235.6 0L235.6 -11Q234.6 -10.8 233.5 -10.7Q232.4 -10.6 231.2 -10.6L231.2 -10.6Q227.6 -10.6 226.4 -11.8Q225.2 -13 225.2 -16.6L225.2 -16.6L225.2 -42.2L235.6 -42.2L235.6 -51.7M256 -35.8L241.8 -35.8Q242.1 -40.8 244.3 -44.1Q246.5 -47.4 249.9 -49.4Q253.3 -51.4 257.55 -52.25Q261.8 -53.1 266.1 -53.1L266.1 -53.1Q270 -53.1 274 -52.55Q278 -52 281.3 -50.4Q284.6 -48.8 286.7 -45.95Q288.8 -43.1 288.8 -38.4L288.8 -38.4L288.8 -11.5Q288.8 -8 289.2 -4.8Q289.6 -1.6 290.6 0L290.6 0L276.2 0Q275.8 -1.2 275.55 -2.45Q275.3 -3.7 275.2 -5L275.2 -5Q271.8 -1.5 267.2 -0.1Q262.6 1.3 257.8 1.3L257.8 1.3Q254.1 1.3 250.9 0.4Q247.7 -0.5 245.3 -2.4Q242.9 -4.3 241.55 -7.2Q240.2 -10.1 240.2 -14.1L240.2 -14.1Q240.2 -18.5 241.75 -21.35Q243.3 -24.2 245.75 -25.9Q248.2 -27.6 251.35 -28.45Q254.5 -29.3 257.7 -29.8Q260.9 -30.3 264 -30.6Q267.1 -30.9 269.5 -31.5Q271.9 -32.1 273.3 -33.25Q274.7 -34.4 274.6 -36.6L274.6 -36.6Q274.6 -38.9 273.85 -40.25Q273.1 -41.6 271.85 -42.35Q270.6 -43.1 268.95 -43.35Q267.3 -43.6 265.4 -43.6L265.4 -43.6Q261.2 -43.6 258.8 -41.8Q256.4 -40 256 -35.8L256 -35.8M274.6 -20L274.6 -25.3Q273.7 -24.5 272.35 -24.05Q271 -23.6 269.45 -23.3Q267.9 -23 266.2 -22.8Q264.5 -22.6 262.8 -22.3L262.8 -22.3Q261.2 -22 259.65 -21.5Q258.1 -21 256.95 -20.15Q255.8 -19.3 255.1 -18Q254.4 -16.7 254.4 -14.7L254.4 -14.7Q254.4 -12.8 255.1 -11.5Q255.8 -10.2 257 -9.45Q258.2 -8.7 259.8 -8.4Q261.4 -8.1 263.1 -8.1L263.1 -8.1Q267.3 -8.1 269.6 -9.5Q271.9 -10.9 273 -12.85Q274.1 -14.8 274.35 -16.8Q274.6 -18.8 274.6 -20L274.6 -20";

/** Bounding-box width of KRAFTA_WORDMARK_PATH at its source font-size. */
const WORDMARK_PATH_WIDTH = 290.6 - 6.9;
/** Bounding-box X-center (left-edge + width/2) of KRAFTA_WORDMARK_PATH. */
const WORDMARK_PATH_CX = (6.9 + 290.6) / 2;
/** Bounding-box Y-center of KRAFTA_WORDMARK_PATH. */
const WORDMARK_PATH_CY = (-71.4 + 1.3) / 2;

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

  // Extract the QR module <path> from the generated SVG. qrcode emits
  // TWO self-closing <path> elements: first is a white background fill
  // (`<path fill="#FFFFFF" .../>`), second is the dark modules drawn as
  // a stroked path (`<path stroke="#000000" .../>`). We want the second
  // one — matching the first leaves us with an empty square, which is
  // exactly what shipped before this fix (caught in design review).
  const pathMatch = rawSvg.match(/<path\s+stroke="[^"]+"[^>]*\/>/);
  const qrPath = pathMatch ? pathMatch[0] : "";

  // Vector wordmark: scale the pre-baked "Krafta" path so its width fills
  // ~80% of the cutout, then translate so its bbox center lands on the
  // QR center. Pre-baked = renders identically in browser, browser
  // canvas (PNG download), and Resvg (server ZIP) — none of which would
  // resolve a `font-family: Helvetica Neue` consistently on their own.
  //
  // A custom `wordmark` string falls back to `<text>` because we only
  // have the vector path for the default "Krafta" — caller-supplied
  // text is rare and accepts the font-fallback tradeoff.
  const center = moduleCount / 2;
  const useVectorWordmark = withWordmark && wordmark === "Krafta";
  const useTextWordmark = withWordmark && wordmark !== "Krafta";

  let wordmarkOverlay = "";
  if (withWordmark) {
    // White cutout in both branches — sized to comfortably exceed the
    // wordmark glyphs so the QR modules don't crowd them.
    const cutoutRect = `<rect x="${cutoutXY}" y="${cutoutXY}" width="${cutoutSide}" height="${cutoutSide}" rx="0.6" fill="#FFFFFF"/>`;

    if (useVectorWordmark) {
      const scale = (cutoutSide * 0.8) / WORDMARK_PATH_WIDTH;
      // SVG transforms apply right-to-left: first translate the path so
      // its bbox center sits on the origin, then scale, then move that
      // scaled-and-centered glyph cluster onto the QR center.
      const transform = `translate(${center} ${center}) scale(${scale.toFixed(5)}) translate(${(-WORDMARK_PATH_CX).toFixed(2)} ${(-WORDMARK_PATH_CY).toFixed(2)})`;
      wordmarkOverlay = `
    <!-- Wordmark cutout + vector Krafta glyphs (Helvetica Neue Bold, pre-baked
         via opentype.js). Vector renders identically across browsers, canvas
         PNG export, and server Resvg — no font dependency. -->
    ${cutoutRect}
    <path d="${KRAFTA_WORDMARK_PATH}" fill="#000000" transform="${transform}"/>`;
    } else if (useTextWordmark) {
      // Caller-supplied wordmark: fall back to <text> with our brand
      // font stack. Renders correctly anywhere the font is available;
      // degrades to Arial elsewhere.
      const textHeight = Math.round(cutoutSide * 0.6);
      wordmarkOverlay = `
    <!-- Wordmark cutout + custom-text fallback. Vector path is only baked
         for the default "Krafta" string. -->
    ${cutoutRect}
    <text
      x="${center}"
      y="${center}"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
      font-weight="700"
      font-size="${textHeight * 0.45}"
      fill="#000000"
      letter-spacing="-0.02em"
    >${escapeXml(wordmark)}</text>`;
    }
  }

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
