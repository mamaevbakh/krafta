"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { ORG_COOKIE, getUserOrgs } from "@/lib/orgs"
import {
  getRequestOrigin,
  getSsoAuthBaseUrl,
  hasSsoRuntimeConfig,
} from "@/lib/sso/config"
import { createClient } from "@/lib/supabase/server"

/**
 * Switch which business the console is acting as.
 *
 * Membership is re-checked here rather than trusted from the client. Without
 * that check this action is an org-impersonation primitive: anyone could POST
 * an arbitrary id and have every subsequent request scoped to a business they
 * don't belong to. A non-member id is silently ignored — same reasoning as the
 * 404-not-403 rule elsewhere in Krafta, since a distinct error would confirm
 * that the organisation exists.
 */
export async function selectOrg(orgId: string) {
  const orgs = await getUserOrgs()
  if (!orgs.some((o) => o.id === orgId)) return

  const jar = await cookies()
  jar.set(ORG_COOKIE, orgId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath("/", "layout")
}

/**
 * Signs out here, and — on production — at the identity provider too.
 *
 * Clearing only the local session is the bug that makes single sign-on feel
 * broken: the merchant presses Sign out, the console returns them to a login
 * screen, they click Continue with Krafta, and they are instantly back in
 * without a password because the provider still has them signed in. On a
 * shared machine that is not a papercut, it is someone else reading their
 * conversations. RP-initiated logout ends both.
 */
export async function signOut(locale: string) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const jar = await cookies()
  jar.delete(ORG_COOKIE)

  if (hasSsoRuntimeConfig()) {
    const headerList = await headers()
    const origin = getRequestOrigin(headerList, "")
    const logout = new URL("/logout", getSsoAuthBaseUrl())
    if (origin) {
      logout.searchParams.set(
        "post_logout_redirect_uri",
        `${origin}/${locale}/sign-in`
      )
    }
    redirect(logout.toString())
  }

  redirect(`/${locale}/sign-in`)
}
