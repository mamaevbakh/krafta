import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a signed-in user stands in setup.
 *
 * Three states matter and they need different destinations:
 *   - no org at all              -> the wizard, from step one
 *   - org but no finished profile -> the wizard (it will pick up the draft)
 *   - finished                    -> their dashboard
 *
 * The middle state is real, not theoretical: an org row is created before the
 * profile, so a crash or a closed tab between the two writes leaves exactly
 * that. Treating it as "done" would drop the merchant on a dashboard whose
 * first charge fails with `org_tax_identity_required_for_fiscalization`.
 */

export type OrgSummary = { orgId: string; orgSlug: string; orgName: string };

async function firstMembershipOrg(
  admin: SupabaseClient,
  userId: string,
): Promise<OrgSummary | null> {
  const { data, error } = await admin
    .from("organization_members")
    .select("org_id, organizations!inner(id, name, slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // PostgREST types an embedded !inner join as an array even when it resolves
  // to one row, so widen through unknown rather than fight the generated type.
  const embedded = (data as unknown as {
    organizations?: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[];
  }).organizations;
  const org = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!org) return null;
  return { orgId: org.id, orgSlug: org.slug, orgName: org.name };
}

/** The user's org only if its onboarding is finished. */
export async function findOnboardedOrg(
  admin: SupabaseClient,
  userId: string,
): Promise<OrgSummary | null> {
  const org = await firstMembershipOrg(admin, userId);
  if (!org) return null;

  const { data, error } = await admin
    .schema("payments")
    .from("org_profiles")
    .select("onboarding_completed_at")
    .eq("org_id", org.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.onboarding_completed_at) return null;

  return org;
}

/**
 * The user's org whether or not onboarding finished.
 *
 * Used by the dashboard gate, which needs to tell "no account" apart from
 * "account exists, setup unfinished" — and by anything that legitimately
 * operates on a half-set-up org.
 */
export async function findAnyOrg(
  admin: SupabaseClient,
  userId: string,
): Promise<OrgSummary | null> {
  return firstMembershipOrg(admin, userId);
}
