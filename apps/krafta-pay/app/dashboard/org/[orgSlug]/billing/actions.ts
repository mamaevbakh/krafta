"use server";

import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { requireOrgAccess } from "@/lib/org-access";
import { createCardSetupSession } from "@/lib/card-setup";
import {
  ensurePlatformSubscription,
  getPlatformBillingExemption,
  getPlatformSubscription,
  platformBillingEnvironment,
  resolvePlatformOrgId,
} from "@krafta/payments-core";

/**
 * Attach (or replace) the card Krafta Pay charges this merchant's platform fee
 * to.
 *
 * The merchant is acting as a CUSTOMER here. The card binds against the
 * platform org's Atmos account, not their own — `createCardSetupSession` uses
 * the subscription's org as the payee, and a platform-fee subscription lives on
 * the platform org, so the apply route resolves our acquirer. Binding it to the
 * merchant's own Atmos contract would mean asking them to pay themselves.
 */
export async function attachPlatformCardAction(formData: FormData) {
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const billingPath = `/dashboard/org/${orgSlug}/billing`;
  const failWith = (message: string) =>
    `${billingPath}?cardError=${encodeURIComponent(message)}`;

  // Only owners and admins can put a company card on file.
  const org = await requireOrgAccess(orgSlug, { minRole: "admin" });

  const payBaseUrl = process.env.PAY_BASE_URL;
  if (!payBaseUrl) redirect(failWith("PAY_BASE_URL is not set"));

  const admin = createAdminSupabase();

  const platformOrgId = await resolvePlatformOrgId(admin);
  if (org.orgId === platformOrgId) redirect(failWith("cannot_bill_platform_org"));

  // An exempt org has no billing page to reach this from, but the action is a
  // POST endpoint of its own — it must refuse on its own terms rather than
  // trusting that the only caller is the button we rendered.
  if (await getPlatformBillingExemption(admin, org.orgId)) {
    redirect(failWith("org_billing_exempt"));
  }

  let record = await getPlatformSubscription(admin, org.orgId);
  if (!record) {
    await ensurePlatformSubscription(admin, { merchantOrgId: org.orgId });
    record = await getPlatformSubscription(admin, org.orgId);
  }
  if (!record) redirect(failWith("platform_subscription_missing"));

  const result = await createCardSetupSession(admin, {
    subscriptionId: String(record.subscription.id),
    // Portal-shaped ownership proof: the payee org plus the concrete customer
    // row. The merchant's own org id is NOT the customer here.
    merchantOrgId: platformOrgId,
    customerId: record.customerId,
    payBaseUrl,
    environment: platformBillingEnvironment(),
    returnUrl: `${payBaseUrl.replace(/\/+$/, "")}${billingPath}`,
  });

  if (!result.ok) redirect(failWith(result.error));

  redirect(result.payUrl);
}
