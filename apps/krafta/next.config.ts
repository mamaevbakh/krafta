import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
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

export default nextConfig;
