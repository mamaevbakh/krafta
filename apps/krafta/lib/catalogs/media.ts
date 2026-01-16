// lib/catalogs/media.ts
import type { Catalog, Item } from "./types";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export function getCatalogLogoUrl(catalog: Catalog): string | null {
  if (!catalog.logo_path || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/krafta/${catalog.logo_path}`;
}

export function getItemImageUrl(item: Item): string | null {
  if (!item.image_path || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/krafta/${item.image_path}`;
}