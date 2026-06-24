/**
 * inline-images.ts — turn external <image href="https://…"> references in
 * a QR SVG into base64 data URIs.
 *
 * Why this exists: a custom logo is embedded in the QR SVG as
 * `<image href="<public storage URL>">`. That renders fine in the live
 * DOM (the studio preview + the dashboard tiles, injected via
 * dangerouslySetInnerHTML). But BOTH export paths choke on the external
 * URL:
 *   - Per-card PNG download rasterizes the SVG by loading it into an
 *     <img> and drawing it to a <canvas>. Browsers block external
 *     resource loads for an SVG loaded as an image (anti-SSRF / privacy),
 *     so the <image> renders as the broken-image placeholder.
 *   - The bulk ZIP route rasterizes via @resvg/resvg-js, which does not
 *     fetch remote URLs at all.
 *
 * Inlining the bytes as a data URI removes the external dependency, so
 * the logo shows up in the exported PNG in both paths. The Supabase
 * public storage CDN sends `access-control-allow-origin: *`, so the
 * browser fetch is allowed cross-origin.
 *
 * Isomorphic: uses global `fetch` (browser + Node 18+) and a base64
 * encoder that works in both runtimes.
 */

function bytesToBase64(bytes: Uint8Array): string {
  // Node path — Buffer is the fastest + avoids the call-stack limit on
  // String.fromCharCode(...spread).
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // Browser path — chunk to stay under the argument-count limit.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return btoa(binary);
}

/**
 * Fetch a URL and return it as a `data:<mime>;base64,…` string, or null
 * if the fetch fails (caller leaves the original href in place, so the QR
 * is still scannable — only the logo goes missing).
 */
export async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType =
      res.headers.get("content-type")?.split(";")[0] || guessMime(url);
    const buf = await res.arrayBuffer();
    const base64 = bytesToBase64(new Uint8Array(buf));
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function guessMime(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

/**
 * Replace every external `<image href="http(s)://…">` in an SVG string
 * with an inlined data URI. Each distinct URL is fetched once. Failed
 * fetches are left untouched.
 */
export async function inlineSvgImages(svg: string): Promise<string> {
  const hrefRe = /href="(https?:\/\/[^"]+)"/g;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(svg)) !== null) {
    urls.add(match[1]);
  }
  if (urls.size === 0) return svg;

  const resolved = await Promise.all(
    [...urls].map(async (url) => [url, await urlToDataUri(url)] as const),
  );

  let out = svg;
  for (const [url, dataUri] of resolved) {
    if (dataUri) {
      out = out.split(`href="${url}"`).join(`href="${dataUri}"`);
    }
  }
  return out;
}
