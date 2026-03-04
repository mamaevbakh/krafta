import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  signState,
} from "@krafta/auth-sso";
import { getRequestOrigin, normalizePayNext } from "@/lib/auth-redirect";
import {
  getSsoAuthBaseUrl,
  getSsoClientId,
  getSsoStateSecret,
  hasSsoRuntimeConfig,
  isSsoEnabled,
  SSO_CODE_VERIFIER_COOKIE,
  SSO_COOKIE_PATH,
  SSO_STATE_COOKIE,
} from "@/lib/sso";

export async function GET(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request.headers);
  const safeNext = normalizePayNext(
    request.nextUrl.searchParams.get("next"),
    requestOrigin,
    "/dashboard",
  );

  if (!isSsoEnabled() || !hasSsoRuntimeConfig()) {
    const fallback = new URL("/login", requestOrigin);
    fallback.searchParams.set("next", safeNext);
    return NextResponse.redirect(fallback.toString());
  }

  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const nonce = createCodeVerifier(16);
  const state = await signState(
    {
      clientId: getSsoClientId(),
      next: safeNext,
      nonce,
      iat: Date.now(),
    },
    getSsoStateSecret(),
  );

  const redirectUri = `${requestOrigin}/auth/sso/callback`;
  const authorizeUrl = buildAuthorizeUrl({
    authBaseUrl: getSsoAuthBaseUrl(),
    clientId: getSsoClientId(),
    redirectUri,
    state,
    codeChallenge,
    next: safeNext,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(SSO_CODE_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: SSO_COOKIE_PATH,
  });
  response.cookies.set(SSO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: SSO_COOKIE_PATH,
  });
  return response;
}
