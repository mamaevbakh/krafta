import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs } from "ai";

import { createSearchCatalogTool } from "@/lib/tools/search-catalog";

/**
 * The customer-facing storefront shopping assistant (AI SDK v6).
 *
 * Returns the streamText config — model + system + the catalog-scoped
 * `searchCatalog` tool + a bounded tool loop. The chat route spreads this and
 * adds the conversation `messages`. Same brain can later back a Telegram
 * surface (see lib/agents/README.md).
 *
 * Model is env-overridable so the cost/quality dial lives in config, not code.
 * Default follows the repo's agent convention (OpenAI-direct, no gateway).
 */
const MODEL_ID = process.env.STOREFRONT_ASSISTANT_MODEL ?? "gpt-5.4";

export function buildShopAssistant(scope: {
  catalogId: string;
  orgId?: string | null;
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
      "Your job: help the shopper figure out what they want and find it in the catalog, then guide them toward adding it to their cart.",
      "",
      "RULES:",
      `- ALWAYS use the searchCatalog tool to look up real products before recommending anything. Never invent items, prices, or availability — only talk about what the tool returns.`,
      "- Reply in the SAME language the shopper writes in (Russian, Uzbek — Latin or Cyrillic — English, or mixed). Match their tone; be warm, concise, and helpful.",
      "- Keep replies short. The UI renders the matching product cards for you, so don't list items verbatim or repeat prices — instead, briefly orient the shopper (e.g. 'Here are a few coffees — the Latte is our milkiest') and ask a follow-up if it helps narrow things down.",
      "- If the search returns nothing relevant, say so honestly and suggest a different search or category. Don't pretend.",
      "- You cannot take payment or place orders. To buy, the shopper taps a product card to open it and add it to their cart.",
      "- Stay on topic: helping this shop's shoppers. Politely decline unrelated requests.",
    ].join("\n"),
    tools: {
      searchCatalog: createSearchCatalogTool({
        catalogId: scope.catalogId,
        orgId: scope.orgId ?? null,
      }),
    },
    // Bound the tool loop: a couple of searches + a final answer.
    stopWhen: stepCountIs(5),
  } as const;
}
