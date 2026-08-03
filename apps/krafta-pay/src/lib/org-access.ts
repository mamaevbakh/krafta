import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getUserSafely } from "@krafta/supabase/auth";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import type { OrgRole } from "@/lib/dashboard-auth";

/**
 * Resolve `/dashboard/org/[orgSlug]` to an authorized organization.
 *
 * This replaces the `?orgId=` query parameter every dashboard page used to
 * read. That pattern had two problems beyond the dropdown it forced into six
 * separate components: the URLs were unshareable (a link to "the plans page"
 * meant nothing without the reader's own org), and the org id was a
 * caller-supplied value each page had to remember to authorize on its own.
 *
 * Here it is authorized once, in one place, before the page renders.
 *
 * A slug the user cannot access is a 404, never a 403 — telling someone an org
 * exists but is not theirs is an enumeration oracle over the merchant list.
 */

export type OrgAccess = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: OrgRole;
  userId: string;
};

const ROLE_RANK: Record<OrgRole, number> = { owner: 3, admin: 2, member: 1 };

export async function requireOrgAccess(
  orgSlug: string,
  options: { minRole?: OrgRole } = {},
): Promise<OrgAccess> {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);

  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard/org/${orgSlug}`));
  }

  const admin = createAdminSupabase();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (orgError) throw orgError;
  if (!org) notFound();

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) notFound();

  const role = membership.role as OrgRole;
  if (options.minRole && (ROLE_RANK[role] ?? 0) < (ROLE_RANK[options.minRole] ?? 0)) {
    notFound();
  }

  return { orgId: org.id, orgSlug: org.slug, orgName: org.name, role, userId: user.id };
}
