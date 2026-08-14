import { NextResponse, type NextRequest } from "next/server"

import { getRequestOrigin, normalizeNext } from "@/lib/sso/config"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_LOCALE } from "@/lib/i18n"

/**
 * Redeems the identity provider's handoff into a Supabase session.
 *
 * This is where the merchant actually becomes signed in. The provider mints a
 * short-lived one-time token against the shared user pool; exchanging it here
 * sets the same session cookies the direct login form would, which is why
 * everything downstream — the org switcher, the eve channel, RLS — needs no
 * knowledge of how the person arrived.
 */
export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request.headers, request.nextUrl.origin)
  const params = request.nextUrl.searchParams
  const home = `/${DEFAULT_LOCALE}`
  const next = normalizeNext(params.get("next"), origin, home)

  const signInWith = (reason: string) => {
    const url = new URL(`/${DEFAULT_LOCALE}/sign-in`, origin)
    url.searchParams.set("error", reason)
    return NextResponse.redirect(url.toString())
  }

  if (params.get("error")) return signInWith("sso_provider_error")

  const tokenHash = params.get("token_hash")
  const type = params.get("type") as
    | "email"
    | "signup"
    | "recovery"
    | "invite"
    | "magiclink"
    | null
  const code = params.get("code")

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    // The provider's message can name whether an address exists, so it is
    // logged rather than shown.
    if (error) return signInWith("sso_verify_failed")
    return NextResponse.redirect(new URL(next, origin).toString())
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return signInWith("sso_exchange_failed")
    return NextResponse.redirect(new URL(next, origin).toString())
  }

  return signInWith("sso_confirm_invalid")
}
