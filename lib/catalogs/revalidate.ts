"use server";

import { revalidateTag } from "next/cache";

export async function revalidateCatalogById(catalogId: string) {
  revalidateTag(`catalog:${catalogId}`, "max");
  revalidateTag(`catalog-structure:${catalogId}`, "max");
}

export async function revalidateCatalogBySlug(slug: string) {
  revalidateTag(`catalog:${slug}`, "max");
}
