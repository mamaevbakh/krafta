import { tool } from "ai";
import { z } from "zod";

// Krafta Studio — the agent's first WRITE capability.
//
// `applyDesign` is a CLIENT tool (no server execute): the Studio panel applies
// the patch to the live builder state, so the merchant sees it in the preview
// and keeps it with the existing "Save changes" button. Misuse-proof by
// construction — every field is enum/range constrained to values the storefront
// already renders, so the agent can restyle freely but can never set something
// the engine can't honor or that misstates money.
//
// Enum literals are kept in sync by hand with the layout/currency settings
// unions (apps/krafta/lib/catalogs/settings/*). They intentionally cover only
// the stable, safe-to-set surface — not currency CODE (locked at shop creation)
// and not brand colors (settings_branding isn't wired to the storefront yet).

export const HEADER_VARIANTS = [
  "header-basic",
  "header-basic-free-logo",
  "header-center",
  "header-hero",
] as const;
export const SECTION_VARIANTS = [
  "section-basic",
  "section-separated",
  "section-pill-tabs",
] as const;
export const ITEM_CARD_VARIANTS = [
  "card-big-photo",
  "card-photo-row",
  "card-minimal",
  "card-default",
  "card-glass-blur",
  "card-row-compact",
] as const;
export const NAV_VARIANTS = [
  "nav-tabs",
  "nav-tabs-motion",
  "nav-tabs-dashboard",
  "nav-none",
] as const;
export const ITEM_DETAIL_VARIANTS = ["item-fullscreen"] as const;
export const THOUSAND_SEPARATORS = [" ", ",", "."] as const;
export const DECIMAL_SEPARATORS = [".", ","] as const;
export const LABEL_POSITIONS = ["prefix", "suffix"] as const;

export type DesignPatch = {
  headerVariant?: (typeof HEADER_VARIANTS)[number];
  sectionVariant?: (typeof SECTION_VARIANTS)[number];
  itemCardVariant?: (typeof ITEM_CARD_VARIANTS)[number];
  categoryNavVariant?: (typeof NAV_VARIANTS)[number];
  itemDetailVariant?: (typeof ITEM_DETAIL_VARIANTS)[number];
  columns?: number;
  enableCart?: boolean;
  showDecimals?: boolean;
  labelPosition?: (typeof LABEL_POSITIONS)[number];
  thousandSeparator?: (typeof THOUSAND_SEPARATORS)[number];
  decimalSeparator?: (typeof DECIMAL_SEPARATORS)[number];
  currencyLabel?: string;
};

export const applyDesignTool = tool({
  description:
    "Apply visual / layout changes to THIS shop's storefront. Set only the " +
    "fields you want to change and omit the rest. Changes appear in the live " +
    "preview immediately; the merchant reviews them and clicks 'Save changes' " +
    "to keep them. Use this whenever the merchant asks to change how the shop " +
    "looks or behaves (header, sections, cards, grid, navigation, cart on/off, " +
    "price formatting). It does NOT edit menu items, prices, photos, brand " +
    "colors, or the currency itself.",
  inputSchema: z.object({
    headerVariant: z
      .enum(HEADER_VARIANTS)
      .optional()
      .describe("Storefront header style."),
    sectionVariant: z
      .enum(SECTION_VARIANTS)
      .optional()
      .describe("How category sections are separated."),
    itemCardVariant: z
      .enum(ITEM_CARD_VARIANTS)
      .optional()
      .describe("Product card family / presentation."),
    categoryNavVariant: z
      .enum(NAV_VARIANTS)
      .optional()
      .describe("Category navigation style. 'nav-none' hides the category bar."),
    itemDetailVariant: z
      .enum(ITEM_DETAIL_VARIANTS)
      .optional()
      .describe("Item detail presentation."),
    columns: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("Product grid columns (1-4)."),
    enableCart: z
      .boolean()
      .optional()
      .describe("Cart + ordering on/off. Off = a browse-only menu."),
    showDecimals: z
      .boolean()
      .optional()
      .describe("Show decimals in prices."),
    labelPosition: z
      .enum(LABEL_POSITIONS)
      .optional()
      .describe("Currency label before (prefix) or after (suffix) the number."),
    thousandSeparator: z.enum(THOUSAND_SEPARATORS).optional(),
    decimalSeparator: z.enum(DECIMAL_SEPARATORS).optional(),
    currencyLabel: z
      .string()
      .max(8)
      .optional()
      .describe("Currency label text shown next to prices, e.g. 'сум' or 'UZS'."),
  }),
  // No execute — handled client-side in studio-agent-panel.tsx.
});
