import { tool } from "ai";
import { z } from "zod";

/**
 * CLIENT-side agent tools for the storefront assistant. They have NO server
 * `execute` — the call is forwarded to the browser, where the assistant
 * component (storefront-assistant.tsx) handles it via useChat's `onToolCall`
 * against the live client cart context (useOptionalCart) and the item sheet.
 * The cart is an optimistic client store, so mutating it from the browser
 * reuses the exact same pipeline as a human tap (dedup, lineKey, haptics).
 *
 * `itemId` is the stable `entityId` returned by searchCatalog.
 */

export const addToCartTool = tool({
  description:
    "Add a catalog item to the shopper's cart. Use after the shopper clearly " +
    "wants to buy an item you found via searchCatalog. For items that have " +
    "options/required choices this opens the item so the shopper picks (the " +
    "result will say so) — never guess options. Confirm quantity if unclear.",
  inputSchema: z.object({
    itemId: z
      .string()
      .describe("The entityId of the item (from searchCatalog results)."),
    quantity: z.number().int().min(1).max(20).optional(),
  }),
});

export const viewCartTool = tool({
  description:
    "Read the shopper's current cart — line items (name, quantity, line total) " +
    "and the subtotal. Call this before answering anything about what is in the " +
    "cart or the total; never guess cart contents.",
  inputSchema: z.object({}),
});

export const openItemTool = tool({
  description:
    "Open an item's detail view so the shopper can see full details, choose " +
    "options/variations, and add it themselves. Use for 'show me details of X' " +
    "or when an item needs choices before it can be added.",
  inputSchema: z.object({
    itemId: z
      .string()
      .describe("The entityId of the item (from searchCatalog results)."),
  }),
});
