import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  signState,
} from "@krafta/auth-sso";
import {
  getSsoAuthBaseUrl,
  getSsoClientId,
  getSsoStateSecret,
  hasSsoRuntimeConfig,
  SSO_CODE_VERIFIER_COOKIE,
  SSO_COOKIE_PATH,
  SSO_STATE_COOKIE,
} from "@/lib/auth/sso";
import { normalizeNextPath } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin;
  const fallbackPath = "/dashboard";
  const safeNext = normalizeNextPath(
    request.nextUrl.searchParams.get("next"),
    requestOrigin,
    fallbackPath,
  );

  if (!hasSsoRuntimeConfig()) {
    const loginUrl = new URL("/login", requestOrigin);
    loginUrl.searchParams.set("next", safeNext);
    return NextResponse.redirect(loginUrl.toString());
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
