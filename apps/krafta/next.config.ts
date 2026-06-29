import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Allow the dev server to accept HMR / RSC requests from devices on the
  // local Wi-Fi (phone testing against the Mac's LAN IP, e.g. when scanning
  // a QR code from a real handset). Next.js 16 blocks cross-origin dev
  // resources by default; this list opts in the LAN range explicitly.
  // Update if the Mac's LAN IP changes.
  allowedDevOrigins: ["192.168.1.3"],
  // Hide the Next.js dev indicator (the small "N" badge at bottom-left in
  // dev mode). It was visually overlapping the floating cart trigger on
  // the customer storefront, leaving the customer wondering why their
  // cart icon had a stray avatar next to it. The indicator is dev-only
  // chrome, irrelevant for our QA flows since we use the next-devtools
  // MCP (see CLAUDE.md) for runtime debugging instead.
  devIndicators: false,
  // @resvg/resvg-js ships native .node bindings (libvips-style binary
  // pulled in to rasterize the QR SVGs into PNGs for the bulk-download
  // zip route). Turbopack can't place those binaries inside an ESM
  // chunk — the Vercel build fails with `non-ecmascript placeable
  // asset`. Opting the package out of bundling tells Next to leave it
  // as a runtime `require()` so the native addon loads normally on the
  // Node.js function runtime. See:
  //   https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
  // Only the QR zip route (app/api/qr-codes/zip/[venueId]/route.ts)
  // imports it, so the impact is isolated to that single Route Handler.
  // heic-convert added for the same reason: it pulls a WASM libheif build
  // (iPhone HEIC → JPEG for menu-photo extraction) that can't be placed in an
  // ESM chunk. Keep it external so it loads via runtime require().
  serverExternalPackages: ["@resvg/resvg-js", "heic-convert"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Menu-photo uploads (onboarding "Snap your menu") POST images to a server
    // action. The default 1MB body cap rejects a real phone photo before the
    // action even runs — surfacing as the generic "check your connection."
    // Raised to fit up to 20 menu photos; the client downscales each photo to
    // ~2000px JPEG first, so a full 20-photo batch lands around ~10–15MB. The
    // client also guards the total before upload.
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  // OIDC discovery for the Telegram Mini App third-party-auth issuer. Supabase
  // fetches `<issuer>/.well-known/openid-configuration`; App Router won't route
  // a literal `.well-known` folder, so map both the OIDC-append and RFC 8414
  // path-insert forms to the discovery route. See app/api/tma/oidc/route.ts.
  async rewrites() {
    return [
      {
        source: "/api/tma/.well-known/openid-configuration",
        destination: "/api/tma/oidc",
      },
      {
        source: "/.well-known/openid-configuration/api/tma",
        destination: "/api/tma/oidc",
      },
    ];
  },
  images: {
    // Custom loader routes <Image> requests through Supabase's image
    // transformation endpoint (Pro plan feature). Single-hop CDN delivery,
    // no Vercel image-optimization quota burn. Loader handles Supabase
    // Storage URLs; non-Supabase URLs (local /public/, external) pass
    // through unchanged. See lib/supabase/image-loader.ts for details.
    loader: "custom",
    loaderFile: "./lib/supabase/image-loader.ts",
    // remotePatterns is unused with a custom loader (no Vercel optimizer
    // running), but kept for safety in case any code path falls back to
    // the default /_next/image route.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hlmcoirjaydrfqcmnuun.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/krafta/**",
      },
      {
        protocol: "https",
        hostname: "hlmcoirjaydrfqcmnuun.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/public-assets/**",
      },
      {
        protocol: "https",
        hostname: "hpbguvxcqyppgyinzmus.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/krafta/**",
      },
      {
        protocol: "https",
        hostname: "hpbguvxcqyppgyinzmus.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/public-assets/**",
      },
    ],
  },
};

// Mount the Krafta Studio codegen agent (studio-agent/, an eve app) behind this
// same app/origin via eve's Next.js integration. withEve MERGES rewrites — our
// existing rules become afterFiles, eve's proxy routes become beforeFiles — and
// spreads the rest of this config untouched; only /eve-prefixed routes proxy to
// the eve runtime. The agent's heavy deps (AI SDK v7, sandbox, workflow) live in
// studio-agent, not this bundle.
export default withEve(nextConfig, { eveRoot: "../../studio-agent" });
