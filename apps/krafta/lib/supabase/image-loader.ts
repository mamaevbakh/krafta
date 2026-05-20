/**
 * Custom next/image loader → Supabase Storage Image Transformation.
 *
 * Why a custom loader instead of Vercel's image optimization:
 *
 *   - Item photos already live in Supabase Storage. With Vercel's default
 *     loader, every image is a 2-hop pull (browser → Vercel edge → Supabase
 *     → Vercel cache → browser) on cold cache, and counts against Vercel's
 *     image-optimization quota.
 *   - Supabase's Pro plan ships generous image-transformation credits via
 *     the `/storage/v1/render/image/public/` endpoint. Single-hop delivery
 *     (browser → Supabase CDN) is faster and doesn't burn Vercel quota.
 *
 * What this loader does:
 *
 *   - For Supabase Storage URLs (`/storage/v1/object/public/...`), rewrite
 *     them to the transformation endpoint and append `width`, `quality`,
 *     `resize=contain` so the merchant's source images get resized server-
 *     side. WebP is delivered by default — AVIF is NOT supported by
 *     Supabase's transformer (known trade-off vs Vercel which does AVIF).
 *   - For everything else (local `/public/` assets, external CDNs, brand
 *     SVGs), pass the URL through unchanged. The custom-loader contract
 *     means Vercel's optimizer is skipped for these too, but they were
 *     mostly small static assets anyway.
 *
 * Wire-up: `apps/krafta/next.config.ts` sets
 *   `images: { loader: "custom", loaderFile: "./lib/supabase/image-loader.ts" }`.
 *
 * Caller usage stays identical — the existing `<Image src=... fill sizes=... />`
 * components keep working. KRA-9's `sizes` attribute on every fill-mode
 * Image makes the responsive variants effective immediately (one
 * transformation request per viewport size).
 *
 * Gotchas:
 *   - The `quality` arg comes from next/image's `quality` prop (default 75).
 *     Don't lift it above 90; Supabase's WebP encoder doesn't visibly
 *     improve past that and you waste bytes.
 *   - This loader is a PURE FUNCTION. It runs at module level in any RSC
 *     context that renders <Image>, so it must not import server-only code.
 */

type LoaderArgs = {
  src: string;
  width: number;
  quality?: number;
};

const STORAGE_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

export default function supabaseImageLoader({
  src,
  width,
  quality,
}: LoaderArgs): string {
  // Pass-through for anything that isn't a Supabase Storage public URL.
  // Local /public/ assets (brand wordmark, favicons, fonts) end up here,
  // as do external image hosts we don't control.
  if (!src.includes(STORAGE_PUBLIC)) {
    return src;
  }

  const transformedPath = src.replace(STORAGE_PUBLIC, RENDER_PUBLIC);

  // Use URL to assemble the query so existing query params on the source
  // URL (rare, but possible) are preserved rather than clobbered.
  const url = new URL(transformedPath);
  url.searchParams.set("width", String(width));
  url.searchParams.set("quality", String(quality ?? 75));
  // `contain` preserves aspect ratio while fitting the longer edge to the
  // requested width. The alternative `cover` crops — we don't want that
  // for catalog imagery where merchants chose the framing.
  url.searchParams.set("resize", "contain");

  return url.toString();
}
