import { describe, expect, it } from "vitest";

import { promoteGalleryEntry, reorderGallery } from "./gallery-order";

const media = [
  { id: "m1", is_primary: true, extra: "a" },
  { id: "m2", is_primary: false, extra: "b" },
  { id: "m3", is_primary: false, extra: "c" },
];

describe("promoteGalleryEntry", () => {
  it("moves the target to the front and makes it the only primary", () => {
    const next = promoteGalleryEntry(media, "m3");
    expect(next.map((m) => m.id)).toEqual(["m3", "m1", "m2"]);
    expect(next.map((m) => m.is_primary)).toEqual([true, false, false]);
  });

  it("keeps extra fields intact", () => {
    const next = promoteGalleryEntry(media, "m2");
    expect(next[0]).toMatchObject({ id: "m2", extra: "b" });
  });

  it("is a no-op for an unknown id", () => {
    expect(promoteGalleryEntry(media, "nope")).toBe(media);
  });
});

describe("reorderGallery", () => {
  it("rebuilds in the given order with primary re-derived from index 0", () => {
    const next = reorderGallery(media, ["m2", "m3", "m1"]);
    expect(next.map((m) => m.id)).toEqual(["m2", "m3", "m1"]);
    expect(next.map((m) => m.is_primary)).toEqual([true, false, false]);
  });

  it("drops unknown ids from the order", () => {
    const next = reorderGallery(media, ["m3", "ghost", "m1", "m2"]);
    expect(next.map((m) => m.id)).toEqual(["m3", "m1", "m2"]);
    expect(next[0].is_primary).toBe(true);
  });

  it("returns [] for an empty order", () => {
    expect(reorderGallery(media, [])).toEqual([]);
  });
});
