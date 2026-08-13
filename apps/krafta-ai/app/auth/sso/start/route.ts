import { NextResponse, type NextRequest } from "next/server"

import { buildAuthorizeUrl, createCodeChallenge, createCodeVerifier, signState } from "@/lib/sso"
import {
  SSO_CODE_VERIFIER_COOKIE,
  SSO_COOKIE_PATH,
  SSO_STATE_COOKIE,
  getRequestOrigin,
  getSsoAuthBaseUrl,
  getSsoClientId,
  getSsoStateSecret,
  hasSsoRuntimeConfig,
  normalizeNext,
} from "@/lib/sso/config"
import { DEFAULT_LOCALE } from "@/lib/i18n"

/**
 * Begins sign-in: mint PKCE, sign the state, hand the visitor to
 * auth.krafta.org.
 *
 * The verifier never leaves this origin — only its SHA-256 challenge travels —
 * so an attacker who intercepts the authorization code still cannot redeem it.
 */
export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request.headers, request.nextUrl.origin)
  const next = normalizeNext(
    request.nextUrl.searchParams.get("next"),
    origin,
    `/${DEFAULT_LOCALE}`
  )

  // No SSO on this deployment (dev): fall back to the direct form rather than
  // sending the merchant to an identity provider that has never heard of us.
  if (!hasSsoRuntimeConfig()) {
    const fallback = new URL(`/${DEFAULT_LOCALE}/sign-in`, origin)
    fallback.searchParams.set("next", next)
    return NextResponse.redirect(fallback.toString())
  }

  const codeVerifier = createCodeVerifier()
  const codeChallenge = await createCodeChallenge(codeVerifier)
  const state = await signState(
    {
      clientId: getSsoClientId(),
      next,
      nonce: createCodeVerifier(16),
      iat: Date.now(),
    },
    getSsoStateSecret()
  )

  const authorizeUrl = buildAuthorizeUrl({
    authBaseUrl: getSsoAuthBaseUrl(),
    clientId: getSsoClientId(),
    redirectUri: `${origin}/auth/sso/callback`,
    state,
    codeChallenge,
    next,
  })

  const response = NextResponse.redirect(authorizeUrl)
  const cookie = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 10 * 60,
    path: SSO_COOKIE_PATH,
  }
  response.cookies.set(SSO_CODE_VERIFIER_COOKIE, codeVerifier, cookie)
  // The state is stored as well as sent, so the callback can compare the two.
  // A returning `state` that this browser never issued is a forged callback.
  response.cookies.set(SSO_STATE_COOKIE, state, cookie)
  return response
}
