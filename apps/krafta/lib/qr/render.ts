/**
 * QR code rendering — styled SVG, isomorphic (works in both Node and
 * browser since `qrcode` and this module are pure JS).
 *
 * The merchant's "QR studio" config (apps/krafta/lib/qr/config.ts) drives:
 *   - Module shape: square / dots / rounded
 *   - Eye outer + inner shapes: square / rounded / circle
 *   - Foreground color OR a 2-stop linear/radial gradient
 *   - Background color (or transparent)
 *   - Centered logo image (with a white halo) OR legacy Krafta wordmark
 *   - Bottom "Scan to order" frame text
 *
 * Why we don't lean on qr-code-styling on the server: that library touches
 * `document` at module load — it's strictly browser-friendly. The Loskir
 * Node fork hard-requires native skia-canvas, which doesn't ship cleanly
 * on Vercel. The simplest path is to walk the qrcode lib's raw module
 * matrix ourselves and emit SVG by hand. Identical output across SSR (qr
 * codes page, settings page, publish flow), the bulk-ZIP PNG route (which
 * pipes our SVG through @resvg/resvg-js), and the browser live preview in
 * the studio UI — single source of truth, zero DOM dependency.
 *
 * Error correction stays locked at H (~30% recovery) so the logo + gradient
 * combos in the studio don't tank scannability.
 */

import QRCode from "qrcode";

import {
  type QrStyleConfig,
  normalizeQrStyle,
} from "./config";

// =========================================================================
// Public surface
// =========================================================================

export type RenderQrOptions = {
  /** Outer SVG canvas size in pixels. Default 320. SVG scales infinitely;
   *  this only sets the intrinsic-size hint. */
  size?: number;
  /** Merchant's saved QR studio config. Pass the raw row from
   *  catalogs.settings_qr_style, or a fully-typed QrStyleConfig. */
  style?: Partial<QrStyleConfig> | QrStyleConfig | null;
  /** Legacy hook: pass `withWordmark: false` to suppress the wordmark.
   *  Equivalent to style.wordmark = "" but kept for the existing call
   *  sites that pre-date the studio (publish-actions, settings page). */
  withWordmark?: boolean;
  /** Legacy hook: override the wordmark text. Equivalent to style.wordmark.
   *  Only used when `style.wordmark` is not explicitly set. */
  wordmark?: string;
};

const WORDMARK_KRAFTA = "Krafta";

/**
 * Render a QR code for `url` as a self-contained SVG string. Style comes
 * from `opts.style` (a QrStyleConfig, partial or full); defaults yield the
 * legacy black-on-white look with the centered Krafta wordmark.
 */
export async function renderQrSvg(
  url: string,
  opts: RenderQrOptions = {},
): Promise<string> {
  const size = opts.size ?? 320;
  const style = resolveStyle(opts);

  // qrcode.create is synchronous and pure-JS — works in both Node and
  // browser. ECC level H is locked regardless of the config; the studio's
  // logo + color combos exhaust most of the H budget on their own.
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const moduleCount = qr.modules.size;
  const matrix = qr.modules.data;
  const isDark = (row: number, col: number): boolean =>
    row >= 0 &&
    row < moduleCount &&
    col >= 0 &&
    col < moduleCount &&
    matrix[row * moduleCount + col] === 1;

  // ---------------------------------------------------------------------
  // Geometry — single quiet-zone module margin around the QR; optional
  // 5-module frame area below for the "Scan to order" text.
  // ---------------------------------------------------------------------
  const margin = 1;
  const frameHeight = style.frame ? 4 : 0;
  const totalWidth = moduleCount + margin * 2;
  const totalHeight = totalWidth + frameHeight;

  // ---------------------------------------------------------------------
  // Finder eyes — three 7×7 patterns at TL / TR / BL. Skip these in the
  // module loop so we can paint custom-shaped eyes on top.
  // ---------------------------------------------------------------------
  const eyeOrigins: Array<{ row: number; col: number }> = [
    { row: 0, col: 0 },
    { row: 0, col: moduleCount - 7 },
    { row: moduleCount - 7, col: 0 },
  ];
  const inEyeRegion = (row: number, col: number): boolean =>
    eyeOrigins.some(
      (o) =>
        row >= o.row && row < o.row + 7 && col >= o.col && col < o.col + 7,
    );

  // ---------------------------------------------------------------------
  // Center cutout — sized to fit either the logo or the wordmark. Modules
  // underneath are still painted; the white rect on top hides them. We
  // paint slightly oversized to give the artwork a clean halo.
  // ---------------------------------------------------------------------
  const cutout = computeCutout(moduleCount, style);

  // ---------------------------------------------------------------------
  // Foreground paint — either a flat color or a gradient ref. When a
  // gradient is in play we emit a <defs><linearGradient/radialGradient>
  // and have all module shapes / eyes use fill="url(#qr-fg)".
  // ---------------------------------------------------------------------
  const fgId = "qr-fg";
  const fgPaint = style.fgGradient ? `url(#${fgId})` : style.fgColor;
  const defs = style.fgGradient
    ? buildGradientDef(fgId, style.fgGradient, moduleCount)
    : "";

  // ---------------------------------------------------------------------
  // Background — separate <rect> behind everything. Transparent (no
  // bgColor) is supported for merchants who want to drop the QR onto a
  // colored print stock.
  // ---------------------------------------------------------------------
  const bgRect =
    style.bgColor === "transparent"
      ? ""
      : `<rect width="${totalWidth}" height="${totalHeight}" fill="${style.bgColor}"/>`;

  // ---------------------------------------------------------------------
  // Module painting — walk the matrix, skip eyes + (modules behind the
  // cutout, which only matters when bgColor !== fgColor and a logo is in
  // place; otherwise the cutout rect hides everything cleanly).
  // ---------------------------------------------------------------------
  const moduleSvg = renderModules({
    moduleCount,
    margin,
    isDark,
    inEyeRegion,
    cutout,
    style,
    fgPaint,
  });

  // ---------------------------------------------------------------------
  // Eyes — three identical groups, just shifted to each origin. The eye
  // outer/inner shapes are independent.
  // ---------------------------------------------------------------------
  const eyesSvg = eyeOrigins
    .map((o) =>
      renderEye(o.row + margin, o.col + margin, style.eyeOuterShape, style.eyeInnerShape, fgPaint),
    )
    .join("");

  // ---------------------------------------------------------------------
  // Center artwork — logo image OR Krafta wordmark OR custom text wordmark
  // OR nothing (when wordmark === "" and no logo).
  // ---------------------------------------------------------------------
  const artwork = renderCenterArtwork({
    moduleCount,
    margin,
    style,
    cutout,
  });

  // ---------------------------------------------------------------------
  // Frame text — optional bottom strip.
  // ---------------------------------------------------------------------
  const frameSvg = style.frame
    ? renderFrame({
        text: style.frame.text,
        color: style.frame.color ?? style.fgColor,
        totalWidth,
        topY: totalWidth + 1.4,
      })
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${size}" height="${size}" shape-rendering="geometricPrecision">${defs}${bgRect}${moduleSvg}${eyesSvg}${artwork}${frameSvg}</svg>`;
}

// =========================================================================
// Internal — module rendering
// =========================================================================

type RenderModulesArgs = {
  moduleCount: number;
  margin: number;
  isDark: (row: number, col: number) => boolean;
  inEyeRegion: (row: number, col: number) => boolean;
  cutout: { x: number; y: number; side: number } | null;
  style: QrStyleConfig;
  fgPaint: string;
};

function renderModules(args: RenderModulesArgs): string {
  const { moduleCount, margin, isDark, inEyeRegion, cutout, style, fgPaint } =
    args;

  // For "square" we build one big <path> with one M/h/v/z per module —
  // smallest SVG. For "dots" / "rounded" we use one <path> with circle /
  // rounded-rect commands.
  const segments: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!isDark(row, col)) continue;
      if (inEyeRegion(row, col)) continue;
      if (
        cutout &&
        row + margin >= cutout.y &&
        row + margin < cutout.y + cutout.side &&
        col + margin >= cutout.x &&
        col + margin < cutout.x + cutout.side
      ) {
        // Skip painting modules underneath the cutout — saves SVG bytes
        // and avoids any subpixel bleed when the artwork has transparent
        // edges.
        continue;
      }
      const x = col + margin;
      const y = row + margin;
      switch (style.moduleShape) {
        case "square":
          // Inclusive rectangle. SVG path: M x y h1 v1 h-1 z.
          segments.push(`M${x} ${y}h1v1h-1z`);
          break;
        case "dots": {
          // Inscribed circle: cx,cy = x+0.5, y+0.5; r = 0.45 (slightly
          // shy of 0.5 so adjacent dots have visible separation).
          const r = 0.45;
          segments.push(
            `M${x + 0.5 - r} ${y + 0.5}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`,
          );
          break;
        }
        case "rounded": {
          // Rounded rect, rx = 0.3. Path with arcs.
          const r = 0.3;
          segments.push(
            `M${x + r} ${y}h${1 - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${1 - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(1 - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(1 - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`,
          );
          break;
        }
      }
    }
  }
  if (segments.length === 0) return "";
  return `<path d="${segments.join("")}" fill="${fgPaint}"/>`;
}

// =========================================================================
// Internal — eyes
// =========================================================================

function renderEye(
  y: number,
  x: number,
  outer: QrStyleConfig["eyeOuterShape"],
  inner: QrStyleConfig["eyeInnerShape"],
  fgPaint: string,
): string {
  // 7×7 finder pattern. Outer ring is the 7×7 minus the inner 5×5 (which
  // is the white gap). Inner block is the 3×3 at offset (2,2).
  const outerSvg = renderEyeOuter(x, y, outer, fgPaint);
  const innerSvg = renderEyeInner(x + 2, y + 2, inner, fgPaint);
  return outerSvg + innerSvg;
}

function renderEyeOuter(
  x: number,
  y: number,
  shape: QrStyleConfig["eyeOuterShape"],
  fgPaint: string,
): string {
  switch (shape) {
    case "square":
      // Outer 7×7 square minus inner 5×5 — use evenodd fill rule with two
      // sub-paths (clockwise outer + counter-clockwise inner) so the
      // middle is hollow.
      return `<path fill="${fgPaint}" fill-rule="evenodd" d="M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z"/>`;
    case "rounded":
      // 7×7 with rounded corners (rx ~1.5), hollowed by a 5×5 also
      // slightly rounded.
      return `<path fill="${fgPaint}" fill-rule="evenodd" d="M${x + 1.5} ${y}h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-4a1.5 1.5 0 0 1 1.5 -1.5z M${x + 2} ${y + 1}a1 1 0 0 0 -1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1 -1v-3a1 1 0 0 0 -1 -1z"/>`;
    case "circle":
      // Concentric circles — outer r=3.5, inner r=2.5, evenodd hollow.
      return `<path fill="${fgPaint}" fill-rule="evenodd" d="M${x + 3.5} ${y}a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0 -7z M${x + 3.5} ${y + 1}a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0 -5z"/>`;
  }
}

function renderEyeInner(
  x: number,
  y: number,
  shape: QrStyleConfig["eyeInnerShape"],
  fgPaint: string,
): string {
  switch (shape) {
    case "square":
      return `<rect x="${x}" y="${y}" width="3" height="3" fill="${fgPaint}"/>`;
    case "rounded":
      return `<rect x="${x}" y="${y}" width="3" height="3" rx="0.8" fill="${fgPaint}"/>`;
    case "circle":
      return `<circle cx="${x + 1.5}" cy="${y + 1.5}" r="1.5" fill="${fgPaint}"/>`;
  }
}

// =========================================================================
// Internal — gradients
// =========================================================================

function buildGradientDef(
  id: string,
  gradient: NonNullable<QrStyleConfig["fgGradient"]>,
  moduleCount: number,
): string {
  const stops = gradient.stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map(
      (s) =>
        `<stop offset="${(s.offset * 100).toFixed(2)}%" stop-color="${s.color}"/>`,
    )
    .join("");

  if (gradient.type === "linear") {
    // Compute x1/y1/x2/y2 from rotation angle. 0° = left→right, 90° =
    // top→bottom. SVG userSpaceOnUse with the QR's bounding box.
    const rad = (gradient.rotation * Math.PI) / 180;
    const cx = moduleCount / 2;
    const cy = moduleCount / 2;
    const half = moduleCount / 2;
    const x1 = cx - Math.cos(rad) * half;
    const y1 = cy - Math.sin(rad) * half;
    const x2 = cx + Math.cos(rad) * half;
    const y2 = cy + Math.sin(rad) * half;
    return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}">${stops}</linearGradient></defs>`;
  }
  // radial
  const cx = moduleCount / 2;
  const cy = moduleCount / 2;
  const r = moduleCount / 2;
  return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops}</radialGradient></defs>`;
}

// =========================================================================
// Internal — center artwork (logo / wordmark)
// =========================================================================

function computeCutout(
  moduleCount: number,
  style: QrStyleConfig,
): { x: number; y: number; side: number } | null {
  // Logo always wins. Logo size is the cutout side.
  if (style.logo) {
    // Clamp to a scannability-safe upper bound. ECC H tolerates ~30%
    // damage; we hold ourselves below that even with a margin halo.
    const clamped = Math.max(0.1, Math.min(0.3, style.logo.size));
    const side = Math.round(moduleCount * clamped) + style.logo.margin * 2;
    const xy = (moduleCount - side) / 2 + 1; // +1 for outer SVG margin
    return { x: xy, y: xy, side };
  }
  // Wordmark cutout — default Krafta if wordmark is null AND no logo;
  // suppressed entirely when wordmark is "" (merchant explicitly cleared).
  if (style.wordmark === "") return null;
  if (style.wordmark === null || style.wordmark === WORDMARK_KRAFTA) {
    // Match the legacy 22% cutout for the Krafta vector wordmark.
    const side = Math.round(moduleCount * 0.22);
    const xy = (moduleCount - side) / 2 + 1;
    return { x: xy, y: xy, side };
  }
  // Custom wordmark text — pick a sane width based on text length, but
  // never exceed 35% (so EC H can still recover).
  const textLen = style.wordmark.length;
  const ratio = Math.max(0.18, Math.min(0.35, 0.07 * textLen + 0.1));
  const side = Math.round(moduleCount * ratio);
  const xy = (moduleCount - side) / 2 + 1;
  return { x: xy, y: xy, side };
}

type RenderArtworkArgs = {
  moduleCount: number;
  margin: number;
  style: QrStyleConfig;
  cutout: { x: number; y: number; side: number } | null;
};

function renderCenterArtwork(args: RenderArtworkArgs): string {
  const { style, cutout } = args;
  if (!cutout) return "";

  // White cutout halo — uses the BACKGROUND color when it's not the
  // canonical white, so logos read cleanly on tinted backgrounds.
  const haloColor = style.bgColor === "transparent" ? "#FFFFFF" : style.bgColor;
  const haloRect = `<rect x="${cutout.x}" y="${cutout.y}" width="${cutout.side}" height="${cutout.side}" rx="0.6" fill="${haloColor}"/>`;

  // Logo path.
  if (style.logo) {
    const inner = cutout.side - style.logo.margin * 2;
    const innerXY = cutout.x + style.logo.margin;
    // preserveAspectRatio xMidYMid meet — center-fit, no crop. Logos are
    // expected to be square but we don't enforce it; rectangular logos
    // letterbox cleanly inside the halo.
    return `${haloRect}<image href="${escapeXml(style.logo.src)}" x="${innerXY}" y="${innerXY}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  // Wordmark path — vector Krafta or text fallback.
  const wordmark = style.wordmark ?? WORDMARK_KRAFTA;
  if (wordmark === "") return haloRect; // explicit clear with halo

  const cx = cutout.x + cutout.side / 2;
  const cy = cutout.y + cutout.side / 2;

  if (wordmark === WORDMARK_KRAFTA) {
    // Inline the pre-baked Krafta vector path. Identical visual across
    // browser, canvas-rasterized PNG, and Resvg-rasterized server PNG —
    // no font dependency.
    const scale = (cutout.side * 0.8) / WORDMARK_PATH_WIDTH;
    const transform = `translate(${cx} ${cy}) scale(${scale.toFixed(5)}) translate(${(-WORDMARK_PATH_CX).toFixed(2)} ${(-WORDMARK_PATH_CY).toFixed(2)})`;
    const wordmarkColor = style.fgGradient ? "url(#qr-fg)" : style.fgColor;
    return `${haloRect}<path d="${KRAFTA_WORDMARK_PATH}" fill="${wordmarkColor}" transform="${transform}"/>`;
  }

  // Custom text wordmark: <text> in the brand font stack. Falls back to
  // Helvetica → Arial across renderers; Resvg picks its default sans.
  const textHeight = Math.round(cutout.side * 0.6);
  const fontSize = (textHeight * 0.45).toFixed(2);
  const wordmarkColor = style.fgGradient ? "url(#qr-fg)" : style.fgColor;
  return `${haloRect}<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-weight="700" font-size="${fontSize}" fill="${wordmarkColor}" letter-spacing="-0.02em">${escapeXml(wordmark)}</text>`;
}

// =========================================================================
// Internal — frame text
// =========================================================================

function renderFrame(args: {
  text: string;
  color: string;
  totalWidth: number;
  topY: number;
}): string {
  const { text, color, totalWidth, topY } = args;
  // Truncate long strings with an ellipsis. ~24 chars fits at the visual
  // print scale; anything longer reads as noise.
  const display = text.length > 24 ? `${text.slice(0, 23)}…` : text;
  const cx = totalWidth / 2;
  return `<text x="${cx}" y="${topY}" text-anchor="middle" dominant-baseline="hanging" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-weight="700" font-size="2.0" letter-spacing="0.08em" fill="${color}">${escapeXml(display).toUpperCase()}</text>`;
}

// =========================================================================
// Internal — style resolution + legacy hook
// =========================================================================

function resolveStyle(opts: RenderQrOptions): QrStyleConfig {
  const style = normalizeQrStyle(opts.style ?? null);
  // Honor legacy hooks only when the style itself doesn't already opt
  // into a wordmark behavior.
  if (opts.withWordmark === false && style.wordmark === null && !style.logo) {
    return { ...style, wordmark: "" };
  }
  if (opts.wordmark !== undefined && style.wordmark === null && !style.logo) {
    return { ...style, wordmark: opts.wordmark };
  }
  return style;
}

// =========================================================================
// Internal — XML escape
// =========================================================================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// =========================================================================
// Krafta wordmark vector path (pre-baked from Helvetica Neue Bold).
// See the comment in the prior render.ts for the regeneration recipe; the
// path bytes themselves are unchanged from that version.
// =========================================================================

const KRAFTA_WORDMARK_PATH =
  "M22.6 -71.4L6.9 -71.4L6.9 0L22.6 0L22.6 -23L31.6 -32.1L53.1 0L72.8 0L42.2 -43.2L70.1 -71.4L50.5 -71.4L22.6 -41.8L22.6 -71.4M91.1 -51.7L77.6 -51.7L77.6 0L91.8 0L91.8 -23.3Q91.8 -26.8 92.5 -29.8Q93.2 -32.8 94.85 -35.05Q96.5 -37.3 99.2 -38.6Q101.9 -39.9 105.8 -39.9L105.8 -39.9Q107.1 -39.9 108.5 -39.75Q109.9 -39.6 110.9 -39.4L110.9 -39.4L110.9 -52.6Q109.2 -53.1 107.8 -53.1L107.8 -53.1Q105.1 -53.1 102.6 -52.3Q100.1 -51.5 97.9 -50.05Q95.7 -48.6 94 -46.55Q92.3 -44.5 91.3 -42.1L91.3 -42.1L91.1 -42.1L91.1 -51.7M130.1 -35.8L115.9 -35.8Q116.2 -40.8 118.4 -44.1Q120.6 -47.4 124 -49.4Q127.4 -51.4 131.65 -52.25Q135.9 -53.1 140.2 -53.1L140.2 -53.1Q144.1 -53.1 148.1 -52.55Q152.1 -52 155.4 -50.4Q158.7 -48.8 160.8 -45.95Q162.9 -43.1 162.9 -38.4L162.9 -38.4L162.9 -11.5Q162.9 -8 163.3 -4.8Q163.7 -1.6 164.7 0L164.7 0L150.3 0Q149.9 -1.2 149.65 -2.45Q149.4 -3.7 149.3 -5L149.3 -5Q145.9 -1.5 141.3 -0.1Q136.7 1.3 131.9 1.3L131.9 1.3Q128.2 1.3 125 0.4Q121.8 -0.5 119.4 -2.4Q117 -4.3 115.65 -7.2Q114.3 -10.1 114.3 -14.1L114.3 -14.1Q114.3 -18.5 115.85 -21.35Q117.4 -24.2 119.85 -25.9Q122.3 -27.6 125.45 -28.45Q128.6 -29.3 131.8 -29.8Q135 -30.3 138.1 -30.6Q141.2 -30.9 143.6 -31.5Q146 -32.1 147.4 -33.25Q148.8 -34.4 148.7 -36.6L148.7 -36.6Q148.7 -38.9 147.95 -40.25Q147.2 -41.6 145.95 -42.35Q144.7 -43.1 143.05 -43.35Q141.4 -43.6 139.5 -43.6L139.5 -43.6Q135.3 -43.6 132.9 -41.8Q130.5 -40 130.1 -35.8L130.1 -35.8M148.7 -20L148.7 -25.3Q147.8 -24.5 146.45 -24.05Q145.1 -23.6 143.55 -23.3Q142 -23 140.3 -22.8Q138.6 -22.6 136.9 -22.3L136.9 -22.3Q135.3 -22 133.75 -21.5Q132.2 -21 131.05 -20.15Q129.9 -19.3 129.2 -18Q128.5 -16.7 128.5 -14.7L128.5 -14.7Q128.5 -12.8 129.2 -11.5Q129.9 -10.2 131.1 -9.45Q132.3 -8.7 133.9 -8.4Q135.5 -8.1 137.2 -8.1L137.2 -8.1Q141.4 -8.1 143.7 -9.5Q146 -10.9 147.1 -12.85Q148.2 -14.8 148.45 -16.8Q148.7 -18.8 148.7 -20L148.7 -20M168.5 -42.2L177 -42.2L177 0L191.2 0L191.2 -42.2L201 -42.2L201 -51.7L191.2 -51.7L191.2 -54.8Q191.2 -58 192.45 -59.35Q193.7 -60.7 196.6 -60.7L196.6 -60.7Q199.3 -60.7 201.8 -60.4L201.8 -60.4L201.8 -71Q200 -71.1 198.1 -71.25Q196.2 -71.4 194.3 -71.4L194.3 -71.4Q185.6 -71.4 181.3 -67Q177 -62.6 177 -55.7L177 -55.7L177 -51.7L168.5 -51.7L168.5 -42.2M235.6 -51.7L225.2 -51.7L225.2 -67.2L211 -67.2L211 -51.7L202.4 -51.7L202.4 -42.2L211 -42.2L211 -11.7Q211 -7.8 212.3 -5.4Q213.6 -3 215.85 -1.7Q218.1 -0.4 221.05 0.05Q224 0.5 227.3 0.5L227.3 0.5Q229.4 0.5 231.6 0.4Q233.8 0.3 235.6 0L235.6 0L235.6 -11Q234.6 -10.8 233.5 -10.7Q232.4 -10.6 231.2 -10.6L231.2 -10.6Q227.6 -10.6 226.4 -11.8Q225.2 -13 225.2 -16.6L225.2 -16.6L225.2 -42.2L235.6 -42.2L235.6 -51.7M256 -35.8L241.8 -35.8Q242.1 -40.8 244.3 -44.1Q246.5 -47.4 249.9 -49.4Q253.3 -51.4 257.55 -52.25Q261.8 -53.1 266.1 -53.1L266.1 -53.1Q270 -53.1 274 -52.55Q278 -52 281.3 -50.4Q284.6 -48.8 286.7 -45.95Q288.8 -43.1 288.8 -38.4L288.8 -38.4L288.8 -11.5Q288.8 -8 289.2 -4.8Q289.6 -1.6 290.6 0L290.6 0L276.2 0Q275.8 -1.2 275.55 -2.45Q275.3 -3.7 275.2 -5L275.2 -5Q271.8 -1.5 267.2 -0.1Q262.6 1.3 257.8 1.3L257.8 1.3Q254.1 1.3 250.9 0.4Q247.7 -0.5 245.3 -2.4Q242.9 -4.3 241.55 -7.2Q240.2 -10.1 240.2 -14.1L240.2 -14.1Q240.2 -18.5 241.75 -21.35Q243.3 -24.2 245.75 -25.9Q248.2 -27.6 251.35 -28.45Q254.5 -29.3 257.7 -29.8Q260.9 -30.3 264 -30.6Q267.1 -30.9 269.5 -31.5Q271.9 -32.1 273.3 -33.25Q274.7 -34.4 274.6 -36.6L274.6 -36.6Q274.6 -38.9 273.85 -40.25Q273.1 -41.6 271.85 -42.35Q270.6 -43.1 268.95 -43.35Q267.3 -43.6 265.4 -43.6L265.4 -43.6Q261.2 -43.6 258.8 -41.8Q256.4 -40 256 -35.8L256 -35.8M274.6 -20L274.6 -25.3Q273.7 -24.5 272.35 -24.05Q271 -23.6 269.45 -23.3Q267.9 -23 266.2 -22.8Q264.5 -22.6 262.8 -22.3L262.8 -22.3Q261.2 -22 259.65 -21.5Q258.1 -21 256.95 -20.15Q255.8 -19.3 255.1 -18Q254.4 -16.7 254.4 -14.7L254.4 -14.7Q254.4 -12.8 255.1 -11.5Q255.8 -10.2 257 -9.45Q258.2 -8.7 259.8 -8.4Q261.4 -8.1 263.1 -8.1L263.1 -8.1Q267.3 -8.1 269.6 -9.5Q271.9 -10.9 273 -12.85Q274.1 -14.8 274.35 -16.8Q274.6 -18.8 274.6 -20L274.6 -20";

const WORDMARK_PATH_WIDTH = 290.6 - 6.9;
const WORDMARK_PATH_CX = (6.9 + 290.6) / 2;
const WORDMARK_PATH_CY = (-71.4 + 1.3) / 2;
