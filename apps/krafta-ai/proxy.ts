import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"
import { hasSsoRuntimeConfig } from "@/lib/sso/config"
import { isLocale } from "@/lib/i18n"

/**
 * Next 16 renamed middleware: this file is `proxy.ts` exporting `proxy()`.
 * There is no `middleware.ts`.
 *
 * Two jobs: keep the Supabase session fresh, and keep signed-out visitors out
 * of the console. Agent traffic under /eve/** is excluded in the matcher — eve
 * runs its own auth policy on those routes and must not be redirected.
 */

/** Reachable signed out. Everything else under a locale needs a session. */
const PUBLIC_SEGMENTS = new Set(["sign-in", "auth"])

function splitLocale(pathname: string) {
  const [, first, second] = pathname.split("/")
  return isLocale(first)
    ? { locale: first, segment: second ?? "" }
    : { locale: null, segment: first ?? "" }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { locale, segment } = splitLocale(pathname)

  // Refresh first, unconditionally — a public page still wants a rotated token
  // rather than one that expires a minute after the visitor signs in.
  const { response, user } = await updateSession(request)

  if (!locale) return response
  if (PUBLIC_SEGMENTS.has(segment)) return response
  if (user) return response

  // Preserve where they were headed so sign-in can return them there. Only the
  // path, never the full URL — an attacker-supplied absolute `next` is an open
  // redirect.
  const search = pathname === `/${locale}` ? "" : `?next=${encodeURIComponent(pathname)}`

  const destination = request.nextUrl.clone()
  // On production, straight to the identity provider — a merchant already
  // signed in to Krafta lands in the console without typing anything, and
  // never sees a second login screen. On dev there is no provider, so the
  // direct form stands in.
  destination.pathname = hasSsoRuntimeConfig()
    ? "/auth/sso/start"
    : `/${locale}/sign-in`
  destination.search = search
  return NextResponse.redirect(destination)
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - /eve/**            agent routes, authenticated by eve itself
     *  - /_next/**          build output
     *  - static asset files
     */
    "/((?!eve/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
