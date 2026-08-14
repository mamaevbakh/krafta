"use server";

import { createSubscriptionCheckout } from "@krafta/payments-core";

import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";

/**
 * Start a subscription for a customer the merchant is already looking at.
 *
 * This is the half that was missing. A merchant could write a customer down and
 * rename them, but the only way to actually bill anyone was the Subscriptions
 * page, which asks for an email and nothing else — and identifies nobody, so it
 * mints a brand-new customer on every submit. A merchant who added «мама
 * Алишера» and then billed her email ended up with two of her, one holding the
 * name and one holding the money.
 *
 * Stripe's own model is this one: you open a customer and create the
 * subscription from there. There is no ambiguity about who is being billed
 * because you are already standing on them.
 *
 * The customer id is not trusted on the way in. It travels through a form, so
 * `createSubscriptionCheckout` re-reads it scoped to the authorized org and the
 * current environment — an id alone must never attach a subscription to another
 * merchant's customer.
 *
 * Calling it twice for the same customer and plan returns the SAME link rather
 * than a second subscription: the customer is now identified, so the existing
 * open checkout resumes. That is the whole point of picking a person instead of
 * describing one.
 */
export type StartSubscriptionResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error: "plan_required" | "pay_base_url_missing" | "customer_not_found" | "failed";
    };

export async function startSubscriptionForCustomer(
  orgSlug: string,
  customerId: string,
  planId: string,
): Promise<StartSubscriptionResult> {
  const org = await requireOrgAccess(orgSlug);
  if (!planId) return { ok: false, error: "plan_required" };

  const payBaseUrl = process.env.PAY_BASE_URL;
  if (!payBaseUrl) return { ok: false, error: "pay_base_url_missing" };

  const supabase = createAdminSupabase();

  try {
    const result = await createSubscriptionCheckout(supabase, {
      merchantOrgId: org.orgId,
      // Follows the sidebar switch, like every other dashboard write. A test
      // link resolving the live provider account would charge a real card.
      environment: await getDashboardEnvironment(),
      customerId,
      customerOrgId: null,
      planId,
      payBaseUrl,
      // Deliberately no success/cancel URL: a link created from the dashboard
      // has no merchant site to return to, so the customer finishes on the
      // Krafta Pay result page rather than a route that does not exist.
    });
    return { ok: true, url: result.payUrl };
  } catch (error) {
    // A customer id that is not this org's, or not in this mode, is the one
    // failure a merchant can actually act on — everything else is ours.
    if (error instanceof Error && error.name === "CustomerNotFoundError") {
      return { ok: false, error: "customer_not_found" };
    }
    console.error("startSubscriptionForCustomer failed", error);
    return { ok: false, error: "failed" };
  }
}
