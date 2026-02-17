// lib/catalogs/media.ts
import type { Catalog, Item } from "./types";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

type CatalogMediaSource = Pick<Catalog, "logo_path">;
type ItemMediaSource = Pick<Item, "image_path">;

export function getCatalogLogoUrl(catalog: CatalogMediaSource): string | null {
  if (!catalog.logo_path || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/krafta/${catalog.logo_path}`;
}

export function getItemImageUrl(item: ItemMediaSource): string | null {
  if (!item.image_path || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/public-assets/${item.image_path}`;
}
