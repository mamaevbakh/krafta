import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "./database.types"

/**
 * Never hoist this into a module-level singleton. On Fluid Compute one function
 * instance serves several concurrent requests, so a shared client would leak
 * one caller's session cookies into another caller's query.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where the cookie jar is
            // read-only. Safe to ignore — proxy.ts refreshes the session on
            // every request, so the rotated token is already persisted there.
          }
        },
      },
    }
  )
}
