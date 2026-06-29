import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { isStepCount } from "ai";

import { createCatalogOverviewTool } from "@/lib/tools/studio-catalog-overview";
import { createSearchCatalogTool } from "@/lib/tools/search-catalog";
import { applyDesignTool } from "@/lib/tools/studio-design-tools";

/**
 * Krafta Studio — the merchant-facing shop-builder AGENT (AI SDK v6).
 *
 * The front door of the "v0/Lovable for commerce" vision. Returns the
 * streamText config (model + system + catalog-scoped read tools + a bounded
 * tool loop); the route spreads this and adds the conversation `messages`.
 *
 * BETA SCOPE: the agent reads the merchant's live shop AND can apply storefront
 * design changes (layout / cards / nav / grid / cart / price formatting) via the
 * applyDesign client tool — which drives the live builder state so the merchant
 * sees the change in the preview and keeps it with "Save changes". It cannot yet
 * edit menu items, brand colors, or the currency. The system prompt is explicit
 * about this so the agent never claims more than it did. See
 * apps/krafta/docs/krafta-studio.md.
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
    instructions: [
      `You are Krafta Studio, an AI design partner that helps a merchant build and shape their online shop "${shop}" on Krafta.`,
      "Krafta runs the commerce engine underneath every shop (cart, real prices and totals, checkout, payments, delivery, orders). The merchant owns the look, the structure, and the words.",
      "",
      "WHAT YOU CAN DO RIGHT NOW (this is a beta):",
      "- Read the merchant's live shop and give concrete, specific advice on structure, layout, wording, and how they merchandise their items.",
      "- APPLY storefront design changes yourself with applyDesign: the header style, how category sections look, the product card family, the grid columns, the category navigation, whether the cart/ordering is on, and how prices are formatted. Your change shows in the live preview immediately; the merchant keeps it by clicking 'Save changes' (top right) — tell them that after you apply.",
      "- What you CANNOT do yet — say so plainly when asked: edit menu items / prices / photos (that's the catalog editor, not here), change brand colors (coming soon), change the currency itself, set a custom domain, or publish. For those, describe what you'd do and where.",
      "",
      "TOOLS — use them, don't guess:",
      "- getCatalogOverview: call this FIRST whenever advice or a change depends on the shop's current state — its categories, item counts, currency, order modes, whether the cart is on, and the live layout (header / card / nav). Ground everything in this real data.",
      "- applyDesign: call this to actually make a visual/layout change the merchant asked for. Set ONLY the fields you're changing, and prefer a single applyDesign call carrying all of them. After it succeeds, briefly confirm what you changed and remind them it's in the preview — click 'Save changes' to keep it.",
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
      applyDesign: applyDesignTool,
      searchCatalog: createSearchCatalogTool({
        catalogId: scope.catalogId,
        orgId: scope.orgId ?? null,
      }),
    },
    // Bound the tool loop: a look at the shop + maybe a search + a final answer.
    stopWhen: isStepCount(6),
  } as const;
}
