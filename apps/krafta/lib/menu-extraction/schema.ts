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
        "Null when no price is legible, or when the item only has variations. Never guess.",
    ),
  variations: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Size/variation name as printed, e.g. \"Маленький\", \"0.5 л\", \"Large\"."),
        price: z
          .number()
          .nonnegative()
          .nullable()
          .describe("Price for THIS size, major units, exactly as printed."),
      }),
    )
    .describe(
      "Sizes/versions of this item, each with its OWN price (e.g. S/M/L, 0.3л/0.5л). " +
        "Empty when the item has a single price (then use `price` instead).",
    ),
  modifiers: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Add-on / choice group name, e.g. \"Молоко\", \"Добавки\", \"Соус\"."),
        required: z
          .boolean()
          .describe("True if the customer MUST choose at least one option in this group."),
        multiple: z
          .boolean()
          .describe("True if MORE THAN ONE option in this group may be chosen."),
        options: z.array(
          z.object({
            name: z
              .string()
              .describe("Option name, e.g. \"Овсяное молоко\", \"Доп. эспрессо\"."),
            price: z
              .number()
              .nonnegative()
              .nullable()
              .describe("EXTRA price added when this option is chosen, major units; null/0 if free."),
          }),
        ),
      }),
    )
    .describe(
      "Add-on / choice groups for this item (pick a milk, add toppings, choose a sauce). " +
        "Only groups CLEARLY printed on the menu — never invent. Empty when there are none.",
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
