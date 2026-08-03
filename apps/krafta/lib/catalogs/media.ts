// lib/catalogs/media.ts
import type { Catalog, Item, PublicItem, PublicItemImage } from "./types";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";

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

  if (trimmed.startsWith(STORAGE_PUBLIC_PREFIX)) {
    if (!baseUrl) return null;
    return `${baseUrl}${trimmed}`;
  }

  if (trimmed.startsWith(STORAGE_PUBLIC_PREFIX.slice(1))) {
    if (!baseUrl) return null;
    return `${baseUrl}/${trimmed}`;
  }

  if (!baseUrl) return null;
  const normalized = trimmed
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\//, "")
    .replace(/^public\/krafta\//, "")
    .replace(/^krafta\//, "");
  return `${baseUrl}/storage/v1/object/public/krafta/${normalized}`;
}

export function getCatalogLogoUrl(catalog: CatalogMediaSource): string | null {
  return getCatalogAssetUrl(catalog.logo_path);
}

/** Public URL for a storage path inside the public-assets bucket
 *  (item photos). Single source of the URL template — item photo URLs
 *  are built here and nowhere else. */
function publicAssetUrl(path: string): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/public-assets/${path}`;
}

export function getItemImageUrl(item: ItemMediaSource): string | null {
  if (!item.image_path) return null;
  return publicAssetUrl(item.image_path);
}

/** One resolved gallery photo for the item detail carousel / viewer. */
export type ItemGalleryImage = {
  url: string;
  alt: string | null;
};

/** The item_media projection the storefront loader fetches. */
export type ItemMediaGalleryRow = {
  item_id: string;
  storage_path: string;
  alt: string | null;
  is_primary: boolean;
  position: number;
};

/**
 * Groups item_media rows into per-item galleries with the main photo
 * first. Rows must already be ordered by position with a stable
 * tiebreaker (the loaders order by `position, id`); the primary row is
 * pulled to the front so the main photo leads even when a legacy row
 * has primary ≠ lowest position. If drifted data ever carries MULTIPLE
 * primary rows (the DB's partial unique index forbids it, but the
 * demote/promote pair isn't transactional), the last one in row order
 * wins the front slot — harmless, deterministic.
 */
export function groupGalleryByItem(
  rows: ItemMediaGalleryRow[],
): Map<string, PublicItemImage[]> {
  const byItem = new Map<string, PublicItemImage[]>();
  for (const row of rows) {
    const list = byItem.get(row.item_id) ?? [];
    const image: PublicItemImage = {
      path: row.storage_path,
      alt: row.alt ?? null,
    };
    if (row.is_primary) {
      list.unshift(image);
    } else {
      list.push(image);
    }
    byItem.set(row.item_id, list);
  }
  return byItem;
}

/**
 * Resolves an item's full photo gallery to public URLs, main photo
 * first (data.ts orders `images` primary-first already). Falls back to
 * the single `image_path` for callers holding an item shape that
 * predates the gallery. Returns [] when the item has no photos or the
 * Supabase base URL is missing.
 */
export function getItemGalleryImages(
  item: Partial<Pick<PublicItem, "images">> & Pick<Item, "image_path"> & {
    image_alt?: string | null;
  },
): ItemGalleryImage[] {
  if (!baseUrl) return [];

  const images: PublicItemImage[] =
    item.images && item.images.length > 0
      ? item.images
      : item.image_path
        ? [{ path: item.image_path, alt: item.image_alt ?? null }]
        : [];

  return images.map((image) => ({
    url: publicAssetUrl(image.path)!,
    alt: image.alt,
  }));
}
