import { NextResponse, type NextRequest } from "next/server"

import { verifyState } from "@/lib/sso"
import {
  SSO_CODE_VERIFIER_COOKIE,
  SSO_COOKIE_PATH,
  SSO_STATE_COOKIE,
  SSO_STATE_TTL_MS,
  getRequestOrigin,
  getSsoAuthBaseUrl,
  getSsoClientId,
  getSsoClientSecret,
  getSsoStateSecret,
  hasSsoRuntimeConfig,
  normalizeNext,
} from "@/lib/sso/config"
import { DEFAULT_LOCALE } from "@/lib/i18n"

type TokenResponse =
  | { handoff_redirect_url: string; token_type: "handoff"; expires_in: number }
  | { error?: string; error_description?: string }

/**
 * Completes sign-in.
 *
 * Five checks before the code is redeemed, and each one closes a real attack:
 * the state must be present, must equal the one this browser was issued, must
 * carry our signature, must name this client, and must be recent. Skipping any
 * of them turns the callback into something a third-party page can trigger.
 *
 * The identity provider does not return tokens here. It returns a one-minute
 * handoff URL back to this origin, which `/auth/confirm` redeems into a
 * Supabase session — so an access token never travels through a query string
 * or a browser history entry.
 */
export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request.headers, request.nextUrl.origin)
  const home = `/${DEFAULT_LOCALE}`
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const verifier = request.cookies.get(SSO_CODE_VERIFIER_COOKIE)?.value
  const storedState = request.cookies.get(SSO_STATE_COOKIE)?.value

  /** Always clear the one-shot cookies, whichever way this ends. */
  const finish = (url: string) => {
    const response = NextResponse.redirect(url)
    response.cookies.delete({ name: SSO_CODE_VERIFIER_COOKIE, path: SSO_COOKIE_PATH })
    response.cookies.delete({ name: SSO_STATE_COOKIE, path: SSO_COOKIE_PATH })
    return response
  }

  const failed = (reason: string, next = home) => {
    const url = new URL(`/${DEFAULT_LOCALE}/sign-in`, origin)
    url.searchParams.set("next", next)
    // A code, not a message: the reason is for our logs, and a raw provider
    // string rendered on a sign-in page is both untranslated and a hint to
    // whoever is probing it.
    url.searchParams.set("error", reason)
    return finish(url.toString())
  }

  if (!hasSsoRuntimeConfig() || !code || !state || !verifier || !storedState) {
    return failed("sso_callback_invalid")
  }
  if (state !== storedState) return failed("sso_state_mismatch")

  const payload = await verifyState(state, getSsoStateSecret())
  if (!payload || payload.clientId !== getSsoClientId()) {
    return failed("sso_state_invalid")
  }
  if (Date.now() - payload.iat > SSO_STATE_TTL_MS) {
    return failed("sso_state_expired")
  }

  const tokenResponse = await fetch(new URL("/token", getSsoAuthBaseUrl()), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/auth/sso/callback`,
      code_verifier: verifier,
      client_id: getSsoClientId(),
      client_secret: getSsoClientSecret(),
    }),
    cache: "no-store",
  })

  const token = (await tokenResponse.json().catch(() => null)) as TokenResponse | null
  if (!tokenResponse.ok || !token || !("handoff_redirect_url" in token)) {
    return failed("sso_token_exchange_failed", payload.next)
  }

  let handoff: URL
  try {
    handoff = new URL(token.handoff_redirect_url)
  } catch {
    return failed("sso_handoff_url_invalid", payload.next)
  }

  // The handoff carries a credential. If the provider ever returned a URL on
  // another origin — compromised, misconfigured, or an allowlist mistake — we
  // would be forwarding a live session token off-site.
  if (handoff.origin !== origin) {
    return failed("sso_handoff_origin_invalid", payload.next)
  }

  const safeNext = normalizeNext(payload.next, origin, home)
  if (handoff.searchParams.get("next") !== safeNext) {
    handoff.searchParams.set("next", safeNext)
  }
  return finish(handoff.toString())
}
