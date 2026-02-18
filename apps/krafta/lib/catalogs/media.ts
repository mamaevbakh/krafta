// lib/catalogs/media.ts
import type { Catalog, Item } from "./types";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

type CatalogMediaSource = Pick<Catalog, "logo_path">;
type ItemMediaSource = Pick<Item, "image_path">;

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getCatalogAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  if (isAbsoluteUrl(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/storage/v1/object/public/")) {
    if (!baseUrl) return null;
    return `${baseUrl}${trimmed}`;
  }

  if (!baseUrl) return null;
  const normalized = trimmed.replace(/^krafta\//, "");
  return `${baseUrl}/storage/v1/object/public/krafta/${normalized}`;
}

export function getCatalogLogoUrl(catalog: CatalogMediaSource): string | null {
  return getCatalogAssetUrl(catalog.logo_path);
}

export function getItemImageUrl(item: ItemMediaSource): string | null {
  if (!item.image_path || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/public-assets/${item.image_path}`;
}
