import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getUserSafely } from "@krafta/supabase/auth";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { findAnyOrg, findOnboardedOrg } from "@/lib/onboarding-status";
import { forwardQuery } from "./forward-query";

/**
 * Redirects for the pre-slug dashboard URLs.
 *
 * Every org-scoped page moved from `/dashboard/plans?orgId=…` to
 * `/dashboard/org/[orgSlug]/plans`. Without this, the move silently 404s every
 * bookmark, every link in an old support thread, and every browser
 * autocomplete a merchant has built up — a self-inflicted outage for exactly
 * the people who use the product most.
 *
 * Next resolves more specific segments first, so `/dashboard/org/…` and
 * `/dashboard/docs` never reach this catch-all.
 *
 * `?orgId=` is honoured when present, because that is what the old links
 * carried and it may name an org other than the user's first one.
 */

const KNOWN_SECTIONS = new Set([
  "payments",
  "providers",
  "plans",
  "subscriptions",
  "tax-codes",
  "api-keys",
  "webhooks",
  "logs",
]);

export default async function LegacyDashboardRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ legacy: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { legacy } = await params;
  const sp = await searchParams;
  const orgIdParam = typeof sp.orgId === "string" ? sp.orgId : undefined;

  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  const admin = createAdminSupabase();

  // A legacy link may name an org explicitly. Honour it, but only after
  // confirming this user actually belongs to it — an old URL is not authority.
  let orgSlug: string | null = null;
  if (orgIdParam) {
    const { data } = await admin
      .from("organization_members")
      .select("organizations!inner(slug)")
      .eq("user_id", user.id)
      .eq("org_id", orgIdParam)
      .maybeSingle();
    const embedded = (data as { organizations?: { slug: string } | { slug: string }[] } | null)
      ?.organizations;
    const org = Array.isArray(embedded) ? embedded[0] : embedded;
    orgSlug = org?.slug ?? null;
  }

  if (!orgSlug) {
    const onboarded = await findOnboardedOrg(admin, user.id);
    // Setup unfinished — the wizard, not a dashboard whose first charge fails.
    if (!onboarded) {
      const partial = await findAnyOrg(admin, user.id);
      redirect(partial ? "/onboarding?resume=1" : "/onboarding");
    }
    orgSlug = onboarded.orgSlug;
  }

  const section = legacy[0];
  const suffix = section && KNOWN_SECTIONS.has(section) ? `/${legacy.join("/")}` : "";

  // Carry the rest of the query string across. The server actions in
  // `app/dashboard/actions.ts` redirect back to these legacy paths with their
  // result attached — `?subError=…` on failure, `?subPayUrl=…&subToken=…` on
  // success — and the org-scoped page reads exactly those keys. Dropping the
  // query here made both invisible: a failed "create subscription" looked like
  // nothing happened at all, and the natural response to that is to submit the
  // same email again, which mints a second customer and a second subscription.
  // The silent redirect was the trigger for the duplicate, not just a cosmetic
  // gap.
  //
  // `orgId` is deliberately not forwarded — see `forward-query.ts`, which holds
  // the rule and its tests.
  const query = forwardQuery(sp);

  redirect(`/dashboard/org/${orgSlug}${suffix}${query ? `?${query}` : ""}`);
}
