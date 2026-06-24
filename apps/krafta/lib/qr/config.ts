/**
 * QR studio config — the typed shape of the merchant's saved QR styling.
 *
 * One schema, three consumers:
 *   - Server SSR (qr-codes page, settings page, publish flow, bulk ZIP route)
 *     reads the catalog's `settings_qr_style` column, normalizes via
 *     `normalizeQrStyle`, and passes to `renderQrSvg`.
 *   - The browser "studio" UI builds the same shape from the form state and
 *     feeds it to the same `renderQrSvg` (which is pure / DOM-free) for the
 *     live preview, then POSTs the normalized JSON to a server action that
 *     writes it back to the DB column.
 *   - The dashboard QR list and the bulk-ZIP route render every QR through
 *     `renderQrSvg(url, normalized)` so all surfaces stay in lockstep.
 *
 * The legacy default — black on white, with the centered "Krafta" wordmark —
 * is what an empty {} normalizes to. So pre-studio catalogs keep rendering
 * identically until the merchant explicitly customizes.
 */

import { z } from "zod";

// =========================================================================
// Enums
// =========================================================================

export const MODULE_SHAPES = ["square", "dots", "rounded"] as const;
export type ModuleShape = (typeof MODULE_SHAPES)[number];

export const EYE_OUTER_SHAPES = ["square", "rounded", "circle"] as const;
export type EyeOuterShape = (typeof EYE_OUTER_SHAPES)[number];

export const EYE_INNER_SHAPES = ["square", "rounded", "circle"] as const;
export type EyeInnerShape = (typeof EYE_INNER_SHAPES)[number];

export const GRADIENT_TYPES = ["linear", "radial"] as const;
export type GradientType = (typeof GRADIENT_TYPES)[number];

// =========================================================================
// Schemas
// =========================================================================

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, "Expected a 6-digit hex color, e.g. #1A1A1A")
  .transform((s) => s.toUpperCase());

const gradientStop = z.object({
  offset: z.number().min(0).max(1),
  color: hexColor,
});

const gradientSchema = z.object({
  type: z.enum(GRADIENT_TYPES),
  // Linear rotation in degrees (0 = left→right, 90 = top→bottom). Ignored
  // by radial gradients.
  rotation: z.number().min(0).max(360).default(0),
  // Always exactly two stops in v1 — the studio surfaces a simple "from"
  // and "to" picker. Multi-stop is plausible later but not worth the UX
  // complexity for v1.
  stops: z.array(gradientStop).min(2).max(2),
});

const logoSchema = z.object({
  /** Public URL or data: URI. The studio uploads the file to the
   *  krafta-logo bucket and stores the resolved public URL here. */
  src: z.string().min(1),
  /** Fraction of the QR side covered by the logo (centered). The renderer
   *  clamps to [0.1, 0.35] regardless of input — anything bigger breaks
   *  scannability even at ECC H. */
  size: z.number().min(0.05).max(0.5).default(0.22),
  /** Padding modules between the logo and the surrounding QR pattern.
   *  Forms the visible white halo. */
  margin: z.number().int().min(0).max(4).default(1),
});

const frameSchema = z.object({
  /** Up to ~24 characters works visually at print scale. The renderer
   *  truncates with an ellipsis past that. */
  text: z.string().max(40),
  /** Frame text color — falls back to fgColor when null. */
  color: hexColor.nullable().default(null),
});

export const qrStyleConfigSchema = z
  .object({
    moduleShape: z.enum(MODULE_SHAPES).default("square"),
    eyeOuterShape: z.enum(EYE_OUTER_SHAPES).default("square"),
    eyeInnerShape: z.enum(EYE_INNER_SHAPES).default("square"),

    fgColor: hexColor.default("#000000"),
    bgColor: hexColor.default("#FFFFFF"),

    /** Optional foreground gradient. When set, overrides fgColor for the
     *  module pattern. Eyes inherit the gradient unless they have their
     *  own color (not exposed in v1 — eyes always inherit). */
    fgGradient: gradientSchema.nullable().default(null),

    logo: logoSchema.nullable().default(null),
    frame: frameSchema.nullable().default(null),

    /** Wordmark centered on the QR. The legacy default ("Krafta", vector-
     *  baked from Helvetica Neue Bold) renders when this is null AND no
     *  logo is set. Merchants who want a clean center pass an empty
     *  string here. Logo always wins over wordmark when both are set. */
    wordmark: z
      .string()
      .max(20)
      .nullable()
      .default(null),
  })
  .strict();

export type QrStyleConfig = z.infer<typeof qrStyleConfigSchema>;

// =========================================================================
// Normalize + helpers
// =========================================================================

/** Default config used when a catalog has no styling saved yet. Matches
 *  the legacy renderer output: black on white, square modules, centered
 *  "Krafta" wordmark. */
export const DEFAULT_QR_STYLE: QrStyleConfig = qrStyleConfigSchema.parse({});

/**
 * Normalize an arbitrary JSON value (e.g. the row from
 * catalogs.settings_qr_style) into a fully-defaulted QrStyleConfig.
 *
 * Tolerant by design: an unrecognised or partially-corrupt config falls
 * back to DEFAULT_QR_STYLE rather than throwing. The merchant can re-save
 * from the studio to fix.
 */
export function normalizeQrStyle(raw: unknown): QrStyleConfig {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_QR_STYLE;
  }
  // The legacy default doesn't carry an explicit wordmark — it implies
  // "Krafta". When the merchant saves a styled config from the studio,
  // wordmark is explicitly set (including to "" to suppress).
  const result = qrStyleConfigSchema.safeParse(raw);
  if (!result.success) {
    return DEFAULT_QR_STYLE;
  }
  return result.data;
}

/** True when the config carries the legacy default ("just a black QR with
 *  the Krafta wordmark"). Used to skip the gradient/logo defs when nothing
 *  exotic is in play, keeping the SVG terse for the common case. */
export function isLegacyDefault(config: QrStyleConfig): boolean {
  return (
    config.moduleShape === "square" &&
    config.eyeOuterShape === "square" &&
    config.eyeInnerShape === "square" &&
    config.fgColor === "#000000" &&
    config.bgColor === "#FFFFFF" &&
    config.fgGradient === null &&
    config.logo === null &&
    config.frame === null &&
    config.wordmark === null
  );
}
