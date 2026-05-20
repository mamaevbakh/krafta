"use server";

import { revalidateTag, updateTag } from "next/cache";

/**
 * updateCatalogByIdAndSlug — Server-Action-only cache invalidation.
 *
 * Next.js 16 splits cache invalidation into two APIs:
 *   - `updateTag` — only callable from Server Actions. Tied to the
 *     post-action revalidation lifecycle (the action completes, then
 *     the tagged cache entries refresh on the next render).
 *   - `revalidateTag` — callable from anywhere. The universal API.
 *
 * Calling `updateTag` from a Route Handler throws:
 *
 *   "updateTag can only be called from within a Server Action."
 *
 * Use this helper from Server Actions only (the dashboard `actions.ts`
 * files). Route Handlers like `/api/items/media` should use
 * `revalidateCatalogByIdAndSlug` (below).
 */
export async function updateCatalogByIdAndSlug(params: {
  catalogId: string;
  catalogSlug?: string;
}) {
  updateTag(`catalog:${params.catalogId}`);
  updateTag(`catalog-structure:${params.catalogId}`);
  updateTag("catalogs");
  if (params.catalogSlug) {
    updateTag(`catalog:${params.catalogSlug}`);
  }
}

/**
 * revalidateCatalogByIdAndSlug — Route-Handler-safe parallel.
 *
 * Same tag set as `updateCatalogByIdAndSlug`, but uses `revalidateTag`
 * (the universal API). Exists specifically for `/api/items/media` and
 * any other Route Handler that needs to bust the catalog cache.
 */
export async function revalidateCatalogByIdAndSlug(params: {
  catalogId: string;
  catalogSlug?: string;
}) {
  // Next 16's revalidateTag requires a second "lifetime" arg ("max"
  // matches the existing revalidateCatalogById helper below).
  revalidateTag(`catalog:${params.catalogId}`, "max");
  revalidateTag(`catalog-structure:${params.catalogId}`, "max");
  revalidateTag("catalogs", "max");
  if (params.catalogSlug) {
    revalidateTag(`catalog:${params.catalogSlug}`, "max");
  }
}

export async function revalidateCatalogById(catalogId: string) {
  revalidateTag(`catalog:${catalogId}`, "max");
  revalidateTag(`catalog-structure:${catalogId}`, "max");
}

export async function revalidateCatalogBySlug(slug: string) {
  revalidateTag(`catalog:${slug}`, "max");
}
