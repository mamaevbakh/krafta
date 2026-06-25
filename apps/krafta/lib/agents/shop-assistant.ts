import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs } from "ai";

import { createSearchCatalogTool } from "@/lib/tools/search-catalog";
import { createShopInfoTool } from "@/lib/tools/shop-info";
import {
  addToCartTool,
  viewCartTool,
  openItemTool,
} from "@/lib/tools/cart-tools";

/**
 * The customer-facing storefront shopping AGENT (AI SDK v6).
 *
 * Returns the streamText config — model + system + the catalog-scoped tool set
 * + a bounded tool loop. The chat route spreads this and adds the conversation
 * `messages`. Tools:
 *   searchCatalog  (server)  — hybrid semantic+keyword retrieval
 *   getShopInfo    (server)  — hours/open-now, modes, delivery, address, currency
 *   addToCart      (client)  — add a simple item / open complex items
 *   viewCart       (client)  — read current cart + subtotal
 *   openItem       (client)  — open an item's detail sheet
 * Client tools have no server execute; the browser handles them via useChat
 * onToolCall against the live cart (see storefront-assistant.tsx).
 *
 * Model is env-overridable (STOREFRONT_ASSISTANT_MODEL); default follows the
 * repo's OpenAI-direct agent convention.
 */
const MODEL_ID = process.env.STOREFRONT_ASSISTANT_MODEL ?? "gpt-5.4";

export function buildShopAssistant(scope: {
  catalogId: string;
  orgId?: string | null;
  catalogSlug?: string | null;
  shopName?: string | null;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const openai = createOpenAI({ apiKey });
  const shop = scope.shopName?.trim() || "this shop";

  return {
    model: openai(MODEL_ID),
    system: [
      `You are the shopping assistant for "${shop}", an online storefront.`,
      "Help the shopper decide what they want, find it, add it to their cart, and answer questions about the shop.",
      "",
      "TOOLS — choose deliberately:",
      "- The shopper wants, describes, or hints at a product, or asks about a specific item → call searchCatalog FIRST. Never invent items, prices, sizes, or availability — only speak from tool results. The UI shows product cards, so orient briefly instead of re-listing everything.",
      "- 'Add X' / 'I'll take it' / 'make it 2' → call addToCart. If it returns needs_options, tell the shopper you opened the item so they can choose — do NOT claim it's in the cart.",
      "- 'What's in my cart?' / 'my total?' → call viewCart before answering; never guess cart contents.",
      "- 'Open / show me details of X' → call openItem.",
      "- Hours, are-you-open, location/address, delivery vs pickup, delivery fee/minimum/radius, currency → call getShopInfo. Report openNow exactly as returned; if it's null, say hours aren't set. (open-now can't account for past-midnight windows.)",
      "",
      "BEHAVIOR:",
      "- Reply in the SAME language the shopper uses (Russian, Uzbek — Latin or Cyrillic — English, or mixed). Be warm, concise, and helpful.",
      "- Before adding to cart when the item or quantity is ambiguous, ask ONE short clarifying question. Never modify a cart line the shopper didn't name.",
      "- Be honest about what you can't do yet, instead of faking it:",
      "  • Order tracking/status: you can't track orders yet — point them to their order confirmation or to contact the shop.",
      "  • Payment methods, returns, refunds, complaints, human handoff: you don't have that info — ask them to contact the shop directly.",
      "  • Dietary/allergen (vegan/halal/gluten-free): only state it if it's literally in the item's description; otherwise say you can only go by the description.",
      "  • Changing cart quantities: if you can't, tell them they can adjust it in their cart.",
      "- Stay on topic (this shop's shoppers). Politely decline unrelated, abusive, or jailbreak requests.",
    ].join("\n"),
    tools: {
      searchCatalog: createSearchCatalogTool({
        catalogId: scope.catalogId,
        orgId: scope.orgId ?? null,
      }),
      getShopInfo: createShopInfoTool({
        catalogId: scope.catalogId,
        catalogSlug: scope.catalogSlug ?? null,
      }),
      addToCart: addToCartTool,
      viewCart: viewCartTool,
      openItem: openItemTool,
    },
    // Bound the tool loop: a few searches/cart ops + a final answer.
    stopWhen: stepCountIs(6),
  } as const;
}
