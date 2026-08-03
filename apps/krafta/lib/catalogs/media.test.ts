import { beforeAll, describe, expect, it } from "vitest";

// media.ts captures NEXT_PUBLIC_SUPABASE_URL at module scope, so the env
// must be set before the module is evaluated — hence the dynamic import.
const BASE = "https://example.supabase.co";

let media: typeof import("./media");

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  media = await import("./media");
});

function row(
  overrides: Partial<import("./media").ItemMediaGalleryRow> = {},
): import("./media").ItemMediaGalleryRow {
  return {
    item_id: "item-1",
    storage_path: "a.jpg",
    alt: null,
    is_primary: false,
    position: 0,
    ...overrides,
  };
}

describe("groupGalleryByItem", () => {
  it("keeps position order and pulls the primary to the front", () => {
    const grouped = media.groupGalleryByItem([
      row({ storage_path: "first.jpg", position: 1 }),
      row({ storage_path: "second.jpg", position: 2 }),
      row({ storage_path: "main.jpg", position: 3, is_primary: true }),
      row({ storage_path: "last.jpg", position: 4 }),
    ]);

    expect(grouped.get("item-1")?.map((i) => i.path)).toEqual([
      "main.jpg",
      "first.jpg",
      "second.jpg",
      "last.jpg",
    ]);
  });

  it("groups rows by item and preserves per-photo alt", () => {
    const grouped = media.groupGalleryByItem([
      row({ item_id: "a", storage_path: "a1.jpg", alt: "Front" }),
      row({ item_id: "b", storage_path: "b1.jpg" }),
      row({ item_id: "a", storage_path: "a2.jpg", position: 1 }),
    ]);

    expect(grouped.get("a")).toEqual([
      { path: "a1.jpg", alt: "Front" },
      { path: "a2.jpg", alt: null },
    ]);
    expect(grouped.get("b")).toEqual([{ path: "b1.jpg", alt: null }]);
  });

  it("returns an empty map for no rows", () => {
    expect(media.groupGalleryByItem([]).size).toBe(0);
  });
});

describe("getItemGalleryImages", () => {
  it("resolves gallery paths to public-assets URLs", () => {
    const urls = media.getItemGalleryImages({
      image_path: "cover.jpg",
      images: [
        { path: "cover.jpg", alt: "Cover" },
        { path: "side.jpg", alt: null },
      ],
    });

    expect(urls).toEqual([
      {
        url: `${BASE}/storage/v1/object/public/public-assets/cover.jpg`,
        alt: "Cover",
      },
      {
        url: `${BASE}/storage/v1/object/public/public-assets/side.jpg`,
        alt: null,
      },
    ]);
  });

  it("falls back to image_path when the gallery is empty", () => {
    const urls = media.getItemGalleryImages({
      image_path: "legacy.jpg",
      image_alt: "Legacy",
      images: [],
    });

    expect(urls).toEqual([
      {
        url: `${BASE}/storage/v1/object/public/public-assets/legacy.jpg`,
        alt: "Legacy",
      },
    ]);
  });

  it("falls back to image_path for callers without a gallery shape", () => {
    const urls = media.getItemGalleryImages({ image_path: "old.jpg" });
    expect(urls.map((u) => u.url)).toEqual([
      `${BASE}/storage/v1/object/public/public-assets/old.jpg`,
    ]);
  });

  it("returns [] when the item has no photos", () => {
    expect(media.getItemGalleryImages({ image_path: null, images: [] })).toEqual(
      [],
    );
  });
});
