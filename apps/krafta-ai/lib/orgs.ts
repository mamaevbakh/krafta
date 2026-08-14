import { cookies } from "next/headers"

import { createClient } from "@/lib/supabase/server"

/** Which organisation the console is currently acting as. */
export const ORG_COOKIE = "krafta_ai_org"

export type Org = {
  id: string
  name: string
  slug: string
  role: string
}

/**
 * Every organisation the signed-in user belongs to.
 *
 * The membership join is what scopes this, and `organization_members` has RLS
 * with policies on the dev branch — so a bug here fails closed (empty list)
 * rather than leaking someone else's businesses.
 */
export async function getUserOrgs(): Promise<Org[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", user.id)

  if (error || !data) return []

  return data
    .flatMap((row) => {
      const org = row.organizations
      return org ? [{ ...org, role: String(row.role) }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The organisation the console is acting as, or null when the user has none.
 *
 * The cookie is a *hint*, never an authorisation: it is re-checked against
 * live membership on every call. A cookie naming an organisation the user
 * cannot reach is treated as absent, not as an error — telling the caller
 * "that org exists but is not yours" is an enumeration oracle over the
 * merchant list, which is why the rest of Krafta answers 404 rather than 403.
 */
export async function getSelectedOrg(): Promise<Org | null> {
  const orgs = await getUserOrgs()
  if (orgs.length === 0) return null

  const wanted = (await cookies()).get(ORG_COOKIE)?.value
  return orgs.find((o) => o.id === wanted) ?? orgs[0]
}
