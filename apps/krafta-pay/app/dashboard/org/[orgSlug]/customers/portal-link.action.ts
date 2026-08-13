"use server";

import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  generateCustomerPortalSessionToken,
  getSharedCustomerPortalSessionExpiry,
  hashCustomerPortalSessionToken,
} from "@/lib/customer-portal";

/**
 * Hand a merchant a link their customer can open to manage their own billing.
 *
 * The portal itself — subscriptions, invoice history, change card, cancel — has
 * been built and working for a while. The only way to open a session for it was
 * `POST /api/v1/customer_portal/sessions`, which needs an API key and a backend
 * to call it. Galaktika is a language school with forty students and no
 * engineer, so for them the feature did not exist. This is the same mint, from
 * a button.
 *
 * DELIBERATELY LONG-LIVED. The API's default expiry is short, which is right
 * for a link a backend generates on demand the moment a customer clicks
 * "manage billing". This link gets pasted into Telegram by a human and opened
 * whenever the parent gets round to it — an hour later, tomorrow morning. A
 * link that has already expired by the time it is read is worse than no button,
 * because the merchant looks broken to their own customer.
 *
 * The token is returned ONCE and only its hash is stored, so a merchant who
 * loses it mints a new one rather than recovering the old.
 */
export type PortalLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: "customer_not_found" | "pay_base_url_missing" | "failed" };

export async function createCustomerPortalLink(
  orgSlug: string,
  customerId: string,
): Promise<PortalLinkResult> {
  // The slug is authorized here, exactly like every other dashboard entry
  // point. A customer id alone must never be enough to mint a portal session —
  // that token is a bearer credential for someone's billing history.
  const org = await requireOrgAccess(orgSlug);
  const payBaseUrl = process.env.PAY_BASE_URL?.replace(/\/+$/, "");
  if (!payBaseUrl) return { ok: false, error: "pay_base_url_missing" };
  const supabase = createAdminSupabase();

  try {
    const { data: customer, error: customerErr } = await supabase
      .schema("payments")
      .from("customers")
      .select("id")
      .eq("id", customerId)
      // Scoped to the org that was just authorized, so a customer id belonging
      // to another merchant resolves to nothing rather than to their portal.
      .eq("org_id", org.orgId)
      .maybeSingle();
    if (customerErr) throw customerErr;
    if (!customer) return { ok: false, error: "customer_not_found" };

    const rawToken = generateCustomerPortalSessionToken();

    const { error: sessionErr } = await (supabase.schema("payments") as any)
      .from("customer_portal_sessions")
      .insert({
        org_id: org.orgId,
        customer_id: customer.id,
        token_hash: hashCustomerPortalSessionToken(rawToken),
        status: "created",
        return_url: null,
        flow_type: null,
        flow_data: {},
        // Marked so these are distinguishable from API-minted sessions when
        // reading customer_portal_events later.
        metadata: { source: "merchant_dashboard" },
        expires_at: getSharedCustomerPortalSessionExpiry(),
      });
    if (sessionErr) throw sessionErr;

    return { ok: true, url: `${payBaseUrl}/portal/${rawToken}` };
  } catch (error) {
    console.error("createCustomerPortalLink failed", error);
    return { ok: false, error: "failed" };
  }
}
