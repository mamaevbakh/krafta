"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import { sealSecret } from "@/lib/crypto/secret-box";
import { getDeliveryProvider } from "@/lib/delivery/providers";
import type { Json } from "@/lib/supabase/types";

/**
 * delivery-courier-actions.ts — per-org Yandex Delivery account connect.
 *
 * The merchant pastes their Yandex Delivery (Go B2B) OAuth token. We run a
 * SAFE auth probe (a /check-price call — never dispatches), reject a 401, and
 * on success seal the token (AES-256-GCM) into commerce.org_delivery_settings.
 * Runs on the authed client so RLS keeps writes to org owners/admins. The
 * token is never echoed back — only its last 4 chars, for confirmation.
 */

type Result<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function connectYandexDelivery(params: {
  orgId: string;
  token: string;
  accountLabel?: string;
}): Promise<Result<{ last4: string }>> {
  const t = await getDashboardT();
  const token = params.token.trim();
  if (!token) {
    return { ok: false, error: t("settings.courier.error_enter_token") };
  }

  const provider = getDeliveryProvider("yandex");
  if (!provider) {
    return { ok: false, error: t("settings.courier.error_provider_unavailable") };
  }

  // SAFE auth probe — a price quote, no courier is dispatched. 401 → reject.
  const verdict = await provider.verifyCredentials(token);
  if (!verdict.ok) {
    return {
      ok: false,
      error:
        verdict.reason === "invalid_token"
          ? t("settings.courier.error_invalid_token")
          : t("settings.courier.error_verify_failed"),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("org_delivery_settings")
    .upsert(
      {
        org_id: params.orgId,
        provider: "yandex",
        credentials_encrypted: sealSecret(token) as unknown as Json,
        account_label: params.accountLabel?.trim() || null,
        is_active: true,
      },
      { onConflict: "org_id" },
    );

  if (error) return { ok: false, error: error.message };

  return { ok: true, last4: token.slice(-4) };
}

export async function setYandexDeliveryActive(params: {
  orgId: string;
  isActive: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("org_delivery_settings")
    .update({ is_active: params.isActive })
    .eq("org_id", params.orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disconnectYandexDelivery(params: {
  orgId: string;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("org_delivery_settings")
    .delete()
    .eq("org_id", params.orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
