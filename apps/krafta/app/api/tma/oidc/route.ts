import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal OIDC discovery document for the TMA third-party-auth issuer.
 *
 * Supabase Third-Party Auth (go-oidc under the hood) resolves our signing keys
 * by fetching `<issuer>/.well-known/openid-configuration`, reading `jwks_uri`,
 * then fetching that. It will NOT trust a bare JWKS — the issuer must be
 * OIDC-discoverable. A `next.config` rewrite maps the standard discovery path
 * to this route.
 *
 * `issuer` MUST equal the token's `iss` and the registered `oidc_issuer_url`
 * byte-for-byte (go-oidc validates this strictly), so we read it from the same
 * env the signer uses (TMA_JWT_ISSUER), falling back to this origin.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const issuer = process.env.TMA_JWT_ISSUER ?? `${origin}/api/tma`;

  return NextResponse.json(
    {
      issuer,
      jwks_uri: `${origin}/api/tma/jwks`,
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
    },
    {
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
