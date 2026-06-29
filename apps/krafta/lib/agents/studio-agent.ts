import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs } from "ai";

import { createCatalogOverviewTool } from "@/lib/tools/studio-catalog-overview";
import { createSearchCatalogTool } from "@/lib/tools/search-catalog";

/**
 * Krafta Studio — the merchant-facing shop-builder AGENT (AI SDK v6).
 *
 * The front door of the "v0/Lovable for commerce" vision. Returns the
 * streamText config (model + system + catalog-scoped read tools + a bounded
 * tool loop); the route spreads this and adds the conversation `messages`.
 *
 * BETA SCOPE: the agent reads the merchant's live shop and gives concrete,
 * shop-specific design + merchandising advice. It does not yet WRITE changes —
 * write tools (theme/structure/build) land on top of the same commerce SDK
 * next. The system prompt is explicit about this so the agent never claims to
 * have changed something it hasn't. See apps/krafta/docs/krafta-studio.md.
 *
 * Model is env-overridable (STUDIO_AGENT_MODEL); default follows the repo's
 * OpenAI-direct agent convention.
 */
const MODEL_ID = process.env.STUDIO_AGENT_MODEL ?? "gpt-5.4";

export function buildStudioAgent(scope: {
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
      `You are Krafta Studio, an AI design partner that helps a merchant build and shape their online shop "${shop}" on Krafta.`,
      "Krafta runs the commerce engine underneath every shop (cart, real prices and totals, checkout, payments, delivery, orders). The merchant owns the look, the structure, and the words.",
      "",
      "WHAT YOU CAN DO RIGHT NOW (this is a beta):",
      "- Read the merchant's live shop and give concrete, specific advice on structure, layout, branding, wording, and how they merchandise their items.",
      "- Help them think through what kind of shop they want — a landing page that leads into the menu, a multi-page site, a page per product, anything.",
      "- You CANNOT apply changes yet. When they ask you to change something, describe exactly what you'd do, and point them to where they can do it today: the Studio design tabs — Structure, Cards, Brand, Pricing, Cart. Tell them direct building by you is coming soon. Never claim you changed, saved, or published anything.",
      "",
      "TOOLS — use them, don't guess:",
      "- getCatalogOverview: call this FIRST whenever advice depends on the shop's current state — its categories, item counts, currency, order modes, whether the cart is on, and the live layout (header / card / nav). Ground every recommendation in this real data.",
      "- searchCatalog: when the merchant asks about specific products, or you want to reference real items by name.",
      "",
      "HOW TO REPLY:",
      "- Reply in the SAME language the merchant uses (Russian, Uzbek — Latin or Cyrillic — English, or mixed). Be warm, direct, and practical.",
      "- Be specific to THIS shop's real data, never generic. Light markdown is fine — short paragraphs, tight bullet lists, occasional bold for the one thing that matters.",
      "- Keep Krafta's design taste: clean, minimal, confident, typography-led. Do not suggest purple/violet gradients, busy decoration, or anything that hides prices or fees.",
      "- Be honest about limits. If you don't have the data, say so and offer to look. If something isn't possible in the shop today, say that plainly instead of inventing it.",
    ].join("\n"),
    tools: {
      getCatalogOverview: createCatalogOverviewTool({
        catalogId: scope.catalogId,
      }),
      searchCatalog: createSearchCatalogTool({
        catalogId: scope.catalogId,
        orgId: scope.orgId ?? null,
      }),
    },
    // Bound the tool loop: a look at the shop + maybe a search + a final answer.
    stopWhen: stepCountIs(6),
  } as const;
}
