import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { searchCatalog } from "@/lib/catalogs/search";

/**
 * `searchCatalog` retrieval tool for the conversational assistant (AI SDK v6).
 *
 * The merchant's catalog scope is BOUND server-side — the model never chooses
 * the tenant, it only supplies the shopper's intent as a query. This wraps the
 * exact same `searchCatalog()` interface the storefront search uses, so the
 * assistant and the storefront retrieve through one backend-swappable path
 * (see `lib/catalogs/search.ts`). It's the first brick of the conversational
 * commerce agent; future tools (addToCart, checkStock, …) compose alongside it
 * in `lib/agents/`.
 *
 * Usage (in the future assistant):
 *   const tools = { searchCatalog: createSearchCatalogTool({ catalogId, orgId }) };
 */
export function createSearchCatalogTool(scope: {
  catalogId: string;
  orgId?: string | null;
}) {
  return tool({
    description:
      "Search the merchant's catalog for items and categories by meaning " +
      "(semantic) and by keywords, in ANY language (Russian, Uzbek — Latin or " +
      "Cyrillic — English, or mixed/transliterated). Use this whenever the " +
      "shopper asks for, describes, or hints at something they might want to " +
      "buy, or to look up a specific item. Returns the most relevant items and " +
      "categories ranked by relevance.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          "The shopper's intent as a search query, in their own language. " +
            "Examples: 'кофе', 'something sweet', 'qahva', 'красное платье', " +
            "'gift for mom'. Keep the meaningful terms; drop conversational filler.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of results to return (default 8)."),
    }),
    execute: async ({ query, limit }) => {
      const rows = await searchCatalog({
        query,
        catalogId: scope.catalogId,
        orgId: scope.orgId ?? null,
        limit: limit ?? 8,
      });

      // Compact, LLM-friendly projection. `entityId` is the stable logical
      // item/category id — a future addToCart/openItem tool can reference it.
      return {
        count: rows.length,
        results: rows.map((row) => ({
          entityId: row.entity_id,
          kind: (row.source_table ?? "").includes("categor")
            ? ("category" as const)
            : ("item" as const),
          title: row.title,
          category: row.subtitle,
          description: row.description,
          relevance: Number((row.score ?? 0).toFixed(4)),
          matchedVia: row.mode, // "hybrid" (semantic+keyword) | "keyword"
        })),
      };
    },
  });
}

export type SearchCatalogTool = ReturnType<typeof createSearchCatalogTool>;
