// Menu extraction — the structured shape a vision model returns when it reads a
// merchant's existing menu (photos / screenshots / PDF) during onboarding.
//
// This is deliberately the SAME shape the onboarding wizard already edits
// (sections → items with a price), so an extracted menu drops straight into the
// wizard's review steps and is persisted by the existing create_wizard_menu
// path. The schema doubles as the contract for the future merchant assistant's
// "create items from a photo" tool — keep it provider-agnostic and minimal.

import { z } from "zod";

export const extractedMenuItemSchema = z.object({
  name: z
    .string()
    .describe("Item name, in the menu's ORIGINAL language. Do not translate."),
  description: z
    .string()
    .nullable()
    .describe("Short description if one is printed next to the item, else null."),
  price: z
    .number()
    .nonnegative()
    .nullable()
    .describe(
      "Numeric price exactly as printed, major units, no currency symbol or " +
        "thousands separators (e.g. \"25 000 сум\" → 25000, \"$4.50\" → 4.5). " +
        "Null when no price is legible. Never guess.",
    ),
});

export const extractedMenuSectionSchema = z.object({
  name: z
    .string()
    .describe(
      "Section/category heading shown on the menu (e.g. Coffee, Salads). " +
        "Use \"Menu\" when the menu has no headings.",
    ),
  items: z.array(extractedMenuItemSchema),
});

export const extractedMenuSchema = z.object({
  currency: z
    .string()
    .nullable()
    .describe("ISO-4217 code if confidently legible (e.g. UZS), else null."),
  sections: z.array(extractedMenuSectionSchema),
});

export type ExtractedMenu = z.infer<typeof extractedMenuSchema>;
export type ExtractedMenuSection = z.infer<typeof extractedMenuSectionSchema>;
export type ExtractedMenuItem = z.infer<typeof extractedMenuItemSchema>;
