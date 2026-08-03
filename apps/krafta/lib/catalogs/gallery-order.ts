// lib/catalogs/gallery-order.ts
//
// Client-side mirror of the media API's "main photo = first photo"
// contract, used by the photo uploader's CREATE mode (the items row
// doesn't exist yet, so the parent owns the gallery array locally and
// createItem later persists it in array order, first = primary).
// Keeping the transforms here — pure and unit-tested — prevents the
// create-mode mirror from drifting out of sync with the server rules
// in app/api/items/media/route.ts.

type GalleryEntry = { id: string; is_primary: boolean };

/**
 * "Set as main": move the target to the front and make it the only
 * primary — the local equivalent of PATCH set-primary. Returns the
 * input array unchanged if the id is unknown.
 */
export function promoteGalleryEntry<T extends GalleryEntry>(
  media: T[],
  mediaId: string,
): T[] {
  const target = media.find((m) => m.id === mediaId);
  if (!target) return media;
  return [
    { ...target, is_primary: true },
    ...media
      .filter((m) => m.id !== mediaId)
      .map((m) => ({ ...m, is_primary: false })),
  ];
}

/**
 * Drag-reorder: rebuild the gallery in the given id order and re-derive
 * primary from the new first position — the local equivalent of PATCH
 * reorder. Ids not present in `media` are dropped; entries missing from
 * `order` are dropped (the caller passes the full visible order).
 */
export function reorderGallery<T extends GalleryEntry>(
  media: T[],
  order: string[],
): T[] {
  const byId = new Map(media.map((m) => [m.id, m]));
  return order
    .map((id) => byId.get(id))
    .filter((m): m is T => Boolean(m))
    .map((m, index) => ({ ...m, is_primary: index === 0 }));
}
