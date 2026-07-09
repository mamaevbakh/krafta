"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { hasSsoRuntimeConfig } from "@/lib/auth/sso";
import {
  setKraftaSubscriptionCancel,
  startKraftaCardChange,
} from "@/lib/payments/pay-internal";

/**
 * First-party subscription lifecycle actions for the Krafta billing page:
 * cancel / resume, and change the renewal card (Atmos, via pay.krafta.uz).
 * Copy is English to match the current billing surface; localization is a
 * tracked follow-up alongside the broader billing redesign.
 */

function resolveAppBaseUrl(origin: string) {
  const configured = process.env.KRAFTA_APP_URL?.trim();
  return configured && configured.length > 0 ? configured : origin;
}

async function requireOrgMember(customerOrgId: string, backTo: string) {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    if (hasSsoRuntimeConfig()) {
      redirect(`/auth/sso/start?next=${encodeURIComponent(backTo)}`);
    }
    redirect(`/login?next=${encodeURIComponent(backTo)}`);
  }
  const { data: membership, error: membershipErr } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", customerOrgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipErr) {
    redirect(`${backTo}?error=${encodeURIComponent(membershipErr.message)}`);
  }
  if (!membership) {
    redirect(`${backTo}?error=Forbidden`);
  }
  return user;
}

export async function cancelSubscriptionAction(formData: FormData) {
  const customerOrgId = String(formData.get("customerOrgId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const catalogSlug = String(formData.get("catalogSlug") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const resume = String(formData.get("resume") ?? "") === "true";
  const back = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
  if (!customerOrgId || !subscriptionId) {
    redirect(`${back}?error=Missing+required+fields`);
  }
  const user = await requireOrgMember(customerOrgId, back);
  const res = await setKraftaSubscriptionCancel({
    customerOrgId,
    subscriptionId,
    cancelAtPeriodEnd: !resume,
    initiatedByUserId: user.id,
  });
  if (!res.ok) {
    redirect(`${back}?error=${encodeURIComponent(res.error ?? "cancel_failed")}`);
  }
  redirect(`${back}?checkout=success`);
}

export async function changeSubscriptionCardAction(formData: FormData) {
  const customerOrgId = String(formData.get("customerOrgId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const catalogSlug = String(formData.get("catalogSlug") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const back = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
  if (!customerOrgId || !subscriptionId) {
    redirect(`${back}?error=Missing+required+fields`);
  }
  const user = await requireOrgMember(customerOrgId, back);
  const origin = getRequestOrigin(await headers());
  const appBaseUrl = resolveAppBaseUrl(origin).replace(/\/+$/, "");
  const res = await startKraftaCardChange({
    customerOrgId,
    subscriptionId,
    returnUrl: `${appBaseUrl}${back}?checkout=success`,
    initiatedByUserId: user.id,
  });
  if (!res.ok) {
    redirect(`${back}?error=${encodeURIComponent(res.error ?? "card_change_failed")}`);
  }
  redirect(res.payUrl);
}
