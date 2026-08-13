import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "./database.types"

const AUTH_COOKIE_MARKER = "-auth-token"
const PKCE_CODE_VERIFIER_MARKER = "-auth-token-code-verifier"

function isSupabaseAuthCookie(name: string) {
  if (!name.startsWith("sb-")) return false
  // The PKCE verifier is mid-flight sign-in state, not a stale session. Wiping
  // it during a refresh failure breaks the very login that would recover.
  if (name.includes(PKCE_CODE_VERIFIER_MARKER)) return false
  return name.includes(AUTH_COOKIE_MARKER)
}

/**
 * Refreshes the Supabase session on every request and hands back the response
 * carrying any rotated cookies.
 *
 * A missing refresh token is not an error worth surfacing — it means the
 * session is simply gone (revoked, expired, or the project was reset). Left
 * alone, the dead cookie makes every subsequent request fail the same way, so
 * we clear it and let the caller redirect to sign-in.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()

  if (error?.message?.includes("Refresh Token")) {
    for (const cookie of request.cookies.getAll()) {
      if (!isSupabaseAuthCookie(cookie.name)) continue
      request.cookies.delete(cookie.name)
      response.cookies.delete(cookie.name)
    }
    return { response, user: null }
  }

  return { response, user: data.user ?? null }
}
