import { afterEach, describe, expect, it, vi } from "vitest";

import { inlineSvgImages, urlToDataUri } from "./inline-images";

/**
 * The QR export paths (per-card canvas PNG + bulk ZIP via Resvg) can't
 * load a remote logo URL, so external <image href> must be inlined to a
 * data URI first. These tests pin the URL-matching + replacement logic
 * with fetch stubbed; the real fetch is exercised in browser QA.
 */

function stubFetch(bytes: Uint8Array, contentType = "image/png") {
  return vi.fn(async () =>
    new Response(bytes, {
      status: 200,
      headers: { "content-type": contentType },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("urlToDataUri", () => {
  it("encodes fetched bytes as a base64 data URI with the response mime", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal("fetch", stubFetch(bytes, "image/jpeg"));
    const result = await urlToDataUri("https://cdn.example.com/logo.jpg");
    expect(result).toBe(`data:image/jpeg;base64,${btoa("\x01\x02\x03\x04")}`);
  });

  it("returns null when the fetch fails (caller keeps the QR scannable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    expect(await urlToDataUri("https://cdn.example.com/missing.png")).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await urlToDataUri("https://cdn.example.com/x.png")).toBeNull();
  });
});

describe("inlineSvgImages", () => {
  it("replaces an external <image href> with a data URI", async () => {
    const bytes = new Uint8Array([255, 0, 255]);
    vi.stubGlobal("fetch", stubFetch(bytes, "image/png"));
    const svg =
      '<svg><image href="https://cdn.example.com/logo.png" x="1"/></svg>';
    const out = await inlineSvgImages(svg);
    expect(out).toContain("href=\"data:image/png;base64,");
    expect(out).not.toContain("https://cdn.example.com/logo.png");
  });

  it("does not fetch when there are no external images (no-op)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const svg = '<svg><path d="M0 0h1v1z" fill="#000"/></svg>';
    expect(await inlineSvgImages(svg)).toBe(svg);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves the original href in place when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    const svg = '<svg><image href="https://cdn.example.com/logo.png"/></svg>';
    expect(await inlineSvgImages(svg)).toBe(svg);
  });

  it("ignores data: hrefs that are already inline", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const svg =
      '<svg><image href="data:image/png;base64,AAAA"/></svg>';
    expect(await inlineSvgImages(svg)).toBe(svg);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
