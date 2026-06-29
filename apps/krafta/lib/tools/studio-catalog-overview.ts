import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { getCatalogOverview } from "@/lib/commerce-sdk";

/**
 * Studio agent tool — a read-only snapshot of the merchant's live shop.
 *
 * Bound to a single catalogId at creation time (the model never chooses the
 * tenant), mirroring the storefront tools' scoping convention. Lets the Krafta
 * Studio agent ground every recommendation in the shop's real categories,
 * item counts, currency, order modes, and current layout instead of guessing.
 */
export function createCatalogOverviewTool(scope: { catalogId: string }) {
  return tool({
    description:
      "Get a snapshot of THIS merchant's current shop: name, status, currency, " +
      "order modes, whether the cart is on, the live layout (header/card/nav), " +
      "category and item counts, per-category item counts, and a few sample item " +
      "names. Call this before giving design or merchandising advice so you speak " +
      "from the real shop, never invented contents.",
    inputSchema: z.object({}),
    execute: async () => {
      const overview = await getCatalogOverview(scope.catalogId);
      if (!overview) {
        return { ok: false as const, reason: "unavailable" };
      }
      return { ok: true as const, overview };
    },
  });
}

export type CatalogOverviewTool = ReturnType<typeof createCatalogOverviewTool>;
