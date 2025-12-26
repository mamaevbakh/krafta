"use server";

import { revalidateTag, updateTag } from "next/cache";

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

export async function revalidateCatalogById(catalogId: string) {
  revalidateTag(`catalog:${catalogId}`, "max");
  revalidateTag(`catalog-structure:${catalogId}`, "max");
}

export async function revalidateCatalogBySlug(slug: string) {
  revalidateTag(`catalog:${slug}`, "max");
}
