import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { openSecret } from "@/lib/crypto/secret-box";

/**
 * credentials.ts — server-only access to commerce.org_delivery_settings.
 *
 * Each merchant COMPANY (org) connects its own Yandex Delivery account; the
 * API token is stored encrypted (app-layer AES-256-GCM, the same secret-box
 * used for Telegram bot tokens). The dispatcher / quote action resolves a
 * token here using a service-role client (trusted server work, bypasses RLS);
 * the token is decrypted here and never leaves the server.
 *
 * Token resolution:
 *   1. The org's connected, active token (org_delivery_settings) → decrypt.
 *   2. Else process.env.YANDEX_DELIVERY_TOKEN — a DEV/TEST fallback only
 *      (Krafta's own token). Real production must NOT set this; each org
 *      brings its own. Mirrors the Telegram shared-platform-token fallback.
 *   3. Else null → the caller treats courier dispatch as unavailable and
 *      falls back to manual delivery (delivery_provider='merchant').
 */

function getAdminClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

export type DeliveryProviderId = Database["commerce"]["Enums"]["delivery_provider"];

export type DeliveryCredentials = {
  provider: DeliveryProviderId;
  token: string;
  accountLabel: string | null;
  /** Where the token came from — 'org' (the merchant's own) or 'env' (dev/test fallback). */
  source: "org" | "env";
};

/** Krafta's own dev/test token. Only used when an org hasn't connected one. */
export function getFallbackDeliveryToken(): string | null {
  return process.env.YANDEX_DELIVERY_TOKEN ?? null;
}

/**
 * Resolve an org's usable courier credentials (provider + decrypted token).
 * Returns null when neither a connected org token nor the env fallback is
 * available — the caller must then degrade to manual delivery.
 */
export async function resolveDeliveryCredentials(
  orgId: string,
): Promise<DeliveryCredentials | null> {
  const supabase = getAdminClient();
  if (supabase) {
    const { data, error } = await supabase
      .schema("commerce")
      .from("org_delivery_settings")
      .select("provider, credentials_encrypted, account_label, is_active")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!error && data && data.is_active && data.credentials_encrypted) {
      const token = openSecret(data.credentials_encrypted);
      if (token) {
        return {
          provider: data.provider,
          token,
          accountLabel: data.account_label,
          source: "org",
        };
      }
    }
  }

  const fallback = getFallbackDeliveryToken();
  if (fallback) {
    return {
      provider: "yandex",
      token: fallback,
      accountLabel: null,
      source: "env",
    };
  }

  return null;
}

/** Convenience: the decrypted token for an org, or null. */
export async function resolveDeliveryToken(orgId: string): Promise<string | null> {
  const creds = await resolveDeliveryCredentials(orgId);
  return creds?.token ?? null;
}
