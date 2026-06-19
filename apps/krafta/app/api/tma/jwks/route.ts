/**
 * /api/tma/jwks — public JWKS for the TMA session signing key.
 *
 * Supabase Third-Party Auth fetches this by the minted token's `iss` to
 * verify the ES256 signature. PUBLIC key only — no secret here. The
 * private half lives in TMA_JWT_PRIVATE_KEY (server env) and never leaves
 * the mint path (lib/telegram/tma-session.ts).
 *
 * The key is stable; if it ever rotates, update this constant AND the
 * Supabase third-party issuer registration in lockstep.
 */

import { NextResponse } from "next/server";

const JWKS = {
  keys: [
    {
      kty: "EC",
      crv: "P-256",
      x: "i86EI_x2-y6KPYBm0p-zGEu4JemK9_JpLIKQ040I2j0",
      y: "GkXzp3-b1heJf52hzblmFMgdyPuDTS9ag48euryEkAs",
      kid: "krafta-tma-78b7bd95",
      use: "sig",
      alg: "ES256",
    },
  ],
} as const;

export async function GET() {
  return NextResponse.json(JWKS, {
    headers: {
      // Public, cacheable — Supabase + edges may cache the verification key.
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
