import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptSecretJsonMaybe,
  encryptSecretJson,
  resolveSecretDecryptionKey,
} from "@krafta/payments-core";
import type { Json } from "@krafta/supabase/database.types";

// Atmos is INLINE + synchronous: a merchant connects it with just OAuth2
// credentials (consumer key/secret) + their store id. No terminal id, content
// language, webhook secret, or fiscalization (unlike Uzum).
export const ATMOS_DEFAULT_API_BASE_URL = "https://apigw.atmos.uz";

/**
 * Resolve the payments environment the running Krafta Pay instance operates in.
 * Provider accounts MUST be written under the same environment the charge-time
 * lookup (`selectProviderCreateAttempt`) uses, or the pay page would report
 * `provider_not_configured` even though the merchant "connected".
 */
export function resolvePayEnvironment(): "test" | "live" {
  return process.env.PAY_ENV === "live" ? "live" : "test";
}

type UpsertAtmosInput = {
  orgId: string;
  environment: "test" | "live";
  // Credentials are optional on update — left blank they merge with the stored
  // values (so a merchant only re-types the key/secret when rotating).
  consumerKey?: string | null;
  consumerSecret?: string | null;
  storeId?: string | null;
  apiBaseUrl?: string | null;
  displayLabel?: string | null;
  status?: "active" | "disabled";
};

function optional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Upsert a merchant's Atmos `org_provider_accounts` row + encrypted
 * `org_provider_account_secrets`. Shared by the dashboard connect route
 * (session-authed) and the internal connect route (HMAC-authed, called by the
 * main Krafta app on the merchant's behalf). `admin` MUST be a service-role
 * client — this bypasses RLS, so callers are responsible for authz.
 */
export async function upsertAtmosProviderAccount(
  admin: SupabaseClient,
  input: UpsertAtmosInput,
): Promise<{
  orgProviderAccountId: string;
  storeId: string;
  apiBaseUrl: string;
}> {
  const environment = input.environment;
  const status = input.status ?? "active";

  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("org_provider_accounts")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("provider_id", "atmos")
    .eq("environment", environment)
    .maybeSingle();
  if (existingErr) throw existingErr;

  // Merge with existing creds so the key/secret can be left blank on update.
  let existingCreds: Record<string, unknown> = {};
  if (existing?.id) {
    const { data: existingSecrets, error: existingSecretsErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .select("credentials_encrypted")
      .eq("org_provider_account_id", existing.id)
      .maybeSingle();
    if (existingSecretsErr) throw existingSecretsErr;
    const decrypted = decryptSecretJsonMaybe(
      existingSecrets?.credentials_encrypted ?? {},
    );
    if (decrypted && typeof decrypted === "object") {
      existingCreds = decrypted as Record<string, unknown>;
    }
  }

  const consumerKey =
    optional(input.consumerKey) ??
    (typeof existingCreds.consumerKey === "string" ? existingCreds.consumerKey : null);
  if (!consumerKey) throw new Error("consumerKey_required");

  const consumerSecret =
    optional(input.consumerSecret) ??
    (typeof existingCreds.consumerSecret === "string"
      ? existingCreds.consumerSecret
      : null);
  if (!consumerSecret) throw new Error("consumerSecret_required");

  const storeId =
    optional(input.storeId) ??
    (existingCreds.storeId != null ? String(existingCreds.storeId) : null);
  if (!storeId) throw new Error("storeId_required");

  const apiBaseUrl =
    optional(input.apiBaseUrl) ??
    (typeof existingCreds.apiBaseUrl === "string"
      ? existingCreds.apiBaseUrl
      : null) ??
    ATMOS_DEFAULT_API_BASE_URL;

  const credentials = { apiBaseUrl, consumerKey, consumerSecret, storeId };
  const secretKey = resolveSecretDecryptionKey(process.env);
  // Fail closed. This used to fall through to writing the merchant's acquirer
  // credentials as plaintext JSON when no key was configured, and that failure
  // is invisible from the outside: `decryptSecretJsonMaybe` returns the raw
  // value both when the key is missing and when decryption throws, so every
  // read of a plaintext row succeeds and nothing ever reports it. The row would
  // sit there readable until someone happened to look.
  //
  // A consumer secret is the credential that moves the merchant's money. If we
  // cannot encrypt it, refusing the write is the only correct outcome — a
  // misconfigured deploy should break the Providers page loudly, not silently
  // downgrade every merchant who connects while it is broken.
  if (!secretKey) throw new Error("credentials_encryption_key_missing");
  const encryptedCredentialsJson = encryptSecretJson(credentials, secretKey) as Json;

  let orgProviderAccountId = existing?.id ?? null;
  if (!orgProviderAccountId) {
    const { data: created, error: createErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .insert({
        org_id: input.orgId,
        provider_id: "atmos",
        environment,
        status,
        display_label: input.displayLabel ?? "Atmos",
        metadata: {},
      })
      .select("id")
      .single();
    if (createErr) throw createErr;
    orgProviderAccountId = created.id;
  } else {
    const { error: updateErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .update({
        status,
        display_label: input.displayLabel ?? "Atmos",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgProviderAccountId);
    if (updateErr) throw updateErr;
  }

  const { data: existingSecrets, error: existingSecretsErr } = await admin
    .schema("payments")
    .from("org_provider_account_secrets")
    .select("org_provider_account_id")
    .eq("org_provider_account_id", orgProviderAccountId)
    .maybeSingle();
  if (existingSecretsErr) throw existingSecretsErr;

  if (existingSecrets) {
    const { error: secretsUpdateErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .update({
        credentials_encrypted: encryptedCredentialsJson,
        updated_at: new Date().toISOString(),
      })
      .eq("org_provider_account_id", orgProviderAccountId);
    if (secretsUpdateErr) throw secretsUpdateErr;
  } else {
    const { error: secretsInsertErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .insert([
        {
          org_provider_account_id: orgProviderAccountId,
          credentials_encrypted: encryptedCredentialsJson,
        },
      ]);
    if (secretsInsertErr) throw secretsInsertErr;
  }

  return { orgProviderAccountId, storeId, apiBaseUrl };
}

/** Soft-disconnect: pause the merchant's Atmos account without dropping creds. */
export async function disableAtmosProviderAccount(
  admin: SupabaseClient,
  input: { orgId: string; environment: "test" | "live" },
): Promise<{ disabled: boolean }> {
  // `disabled` reports what actually happened, not that the statement ran.
  //
  // This returned true unconditionally, so a disconnect that matched no row —
  // because the caller resolved a different environment than the one the
  // merchant's account is stored under — still reported success. The caller
  // then flips its own is_active flag off, and the merchant is shown as
  // disconnected while their account keeps taking card payments. Reporting the
  // row count makes that a visible failure instead of a silent one.
  const { data, error } = await admin
    .schema("payments")
    .from("org_provider_accounts")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("org_id", input.orgId)
    .eq("provider_id", "atmos")
    .eq("environment", input.environment)
    .select("id");
  if (error) throw error;
  return { disabled: (data ?? []).length > 0 };
}
