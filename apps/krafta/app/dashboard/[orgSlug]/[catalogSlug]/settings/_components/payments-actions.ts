"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import { orgCan } from "@/lib/billing/gate";
import {
  connectMerchantAtmos,
  disconnectMerchantAtmos,
} from "@/lib/payments/pay-internal";

/**
 * payments-actions.ts — per-org "Connect Krafta Pay" (Atmos, BYOA).
 *
 * The merchant enters their OWN Atmos credentials (store id + consumer
 * key/secret). We provision them in Krafta Pay under this org (encrypted there,
 * never stored here), then record a non-secret connection flag in
 * commerce.org_payment_settings so the storefront can offer card checkout. Runs
 * on the authed client so RLS keeps the settings write to org owners/admins.
 */

type Result<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function connectAtmosPayments(params: {
  orgId: string;
  storeId: string;
  consumerKey: string;
  consumerSecret: string;
  accountLabel?: string;
}): Promise<Result<{ verified: boolean; storeId: string }>> {
  const t = await getDashboardT();
  const storeId = params.storeId.trim();
  const consumerKey = params.consumerKey.trim();
  const consumerSecret = params.consumerSecret.trim();
  if (!storeId || !consumerKey || !consumerSecret) {
    return { ok: false, error: t("settings.payments.error_enter_creds") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("settings.payments.error_not_signed_in") };

  // Card acceptance is a Pro-tier feature.
  if (!(await orgCan(params.orgId, "card_payments"))) {
    return {
      ok: false,
      error: t("settings.payments.error_pro_required"),
    };
  }

  // Provision the merchant's Atmos account in Krafta Pay (validates the creds,
  // stores them encrypted there). initiatedByUserId → Krafta Pay re-checks org
  // admin as defense in depth.
  const connect = await connectMerchantAtmos({
    orgId: params.orgId,
    storeId,
    consumerKey,
    consumerSecret,
    displayLabel: params.accountLabel?.trim() || undefined,
    initiatedByUserId: user.id,
  });
  if (!connect.ok) {
    const message =
      connect.error === "credentials_rejected"
        ? t("settings.payments.error_credentials_rejected")
        : connect.error === "forbidden"
          ? t("settings.payments.error_forbidden")
          : t("settings.payments.error_connect_failed");
    return { ok: false, error: message };
  }

  // Record the non-secret connection flag (RLS keeps this to owners/admins).
  const { error } = await supabase
    .schema("commerce")
    .from("org_payment_settings")
    .upsert(
      {
        org_id: params.orgId,
        provider: "atmos",
        environment: connect.environment,
        is_active: true,
        account_label: params.accountLabel?.trim() || null,
        store_id: connect.storeId,
        verified: connect.verified,
      },
      { onConflict: "org_id" },
    );
  if (error) return { ok: false, error: error.message };

  return { ok: true, verified: connect.verified, storeId: connect.storeId };
}

export async function setAtmosPaymentsActive(params: {
  orgId: string;
  isActive: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("org_payment_settings")
    .update({ is_active: params.isActive })
    .eq("org_id", params.orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disconnectAtmosPayments(params: {
  orgId: string;
}): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Disable the provider account in Krafta Pay (keeps the encrypted creds for a
  // later reconnect), then flip the local flag off so the storefront hides card.
  await disconnectMerchantAtmos({
    orgId: params.orgId,
    initiatedByUserId: user?.id,
  });

  const { error } = await supabase
    .schema("commerce")
    .from("org_payment_settings")
    .update({ is_active: false })
    .eq("org_id", params.orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
