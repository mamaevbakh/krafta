import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getUserSafely } from "@krafta/supabase/auth";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { findAnyOrg, findOnboardedOrg } from "@/lib/onboarding-status";

/**
 * `/dashboard` is now a resolver, not a page.
 *
 * Every org-scoped screen lives under `/dashboard/org/[orgSlug]`, so this
 * route's only job is to work out where a given user belongs and send them
 * there. It also keeps every historical `/dashboard?orgId=…` bookmark working:
 * they land here and get forwarded to the slug URL.
 *
 * The onboarding gate lives here too, and it deliberately distinguishes three
 * states rather than two. "Has an org" is not the same as "finished setup": the
 * org row is written before the tax profile, so a closed tab between those two
 * writes leaves a real, reachable in-between state. Treating that as done would
 * hand someone a dashboard whose first charge fails with
 * `org_tax_identity_required_for_fiscalization`.
 */
export default async function DashboardIndexPage() {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);

  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  const admin = createAdminSupabase();

  const onboarded = await findOnboardedOrg(admin, user.id);
  if (onboarded) redirect(`/dashboard/org/${onboarded.orgSlug}`);

  // An org exists but the wizard never finished — resume it rather than
  // starting over, and rather than letting them past.
  const partial = await findAnyOrg(admin, user.id);
  redirect(partial ? "/onboarding?resume=1" : "/onboarding");
}
