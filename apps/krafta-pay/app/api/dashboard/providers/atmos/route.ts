import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";
import {
  decryptSecretJsonMaybe,
  encryptSecretJson,
  resolveSecretDecryptionKey,
} from "@krafta/payments-core";
import type { Json } from "@krafta/supabase/database.types";

// Atmos is INLINE + synchronous: a merchant connects it with just OAuth2
// credentials (consumer key/secret) + their store id. No terminal id, content
// language, webhook secret, or fiscalization (unlike Uzum).
const DEFAULT_API_BASE_URL = "https://apigw.atmos.uz";

type UpsertBody = {
  orgId: string;
  environment?: "test" | "live";
  displayLabel?: string;
  consumerKey?: string;
  consumerSecret?: string;
  storeId?: string;
  apiBaseUrl?: string;
  status?: "active" | "disabled";
};

function parseString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field}_required`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseString(url.searchParams.get("orgId"), "orgId");
    const environment = (url.searchParams.get("environment") ?? "live") as "test" | "live";

    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "member" });

    const admin = createAdminSupabase();
    const { data: account, error: accountErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .select("id, status, display_label, environment")
      .eq("org_id", orgId)
      .eq("provider_id", "atmos")
      .eq("environment", environment)
      .maybeSingle();
    if (accountErr) throw accountErr;

    if (!account) {
      return NextResponse.json({ configured: false });
    }

    const { data: secrets, error: secretsErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .select("credentials_encrypted")
      .eq("org_provider_account_id", account.id)
      .maybeSingle();
    if (secretsErr) throw secretsErr;

    const credentials = decryptSecretJsonMaybe(secrets?.credentials_encrypted ?? {});
    const rec =
      credentials && typeof credentials === "object"
        ? (credentials as Record<string, unknown>)
        : {};

    return NextResponse.json({
      configured: true,
      account: {
        id: account.id,
        status: account.status,
        environment: account.environment,
        displayLabel: account.display_label,
      },
      credentials: {
        // Non-secret connection details are echoed back; the key/secret are not.
        apiBaseUrl: typeof rec.apiBaseUrl === "string" ? rec.apiBaseUrl : null,
        storeId: rec.storeId != null ? String(rec.storeId) : null,
        hasConsumerKey: Boolean(rec.consumerKey),
        hasConsumerSecret: Boolean(rec.consumerSecret),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function upsertProvider(req: Request, method: "POST" | "PATCH") {
  const { supabase, user } = await getAuthenticatedUserOrThrow();
  const body = (await req.json()) as Partial<UpsertBody>;

  const orgId = parseString(body.orgId, "orgId");
  await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

  const environment = body.environment ?? "live";
  const status = body.status ?? "active";
  const admin = createAdminSupabase();

  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("org_provider_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("provider_id", "atmos")
    .eq("environment", environment)
    .maybeSingle();
  if (existingErr) throw existingErr;

  // Merge with existing creds so the consumer key/secret can be left blank on an
  // update (only re-typed when rotating).
  let existingCreds: Record<string, unknown> = {};
  if (existing?.id) {
    const { data: existingSecrets, error: existingSecretsErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .select("credentials_encrypted")
      .eq("org_provider_account_id", existing.id)
      .maybeSingle();
    if (existingSecretsErr) throw existingSecretsErr;
    const decrypted = decryptSecretJsonMaybe(existingSecrets?.credentials_encrypted ?? {});
    if (decrypted && typeof decrypted === "object") {
      existingCreds = decrypted as Record<string, unknown>;
    }
  }

  const consumerKey =
    parseOptionalString(body.consumerKey) ??
    (typeof existingCreds.consumerKey === "string" ? existingCreds.consumerKey : null);
  if (!consumerKey) throw new Error("consumerKey_required");

  const consumerSecret =
    parseOptionalString(body.consumerSecret) ??
    (typeof existingCreds.consumerSecret === "string" ? existingCreds.consumerSecret : null);
  if (!consumerSecret) throw new Error("consumerSecret_required");

  const storeId =
    parseOptionalString(body.storeId) ??
    (existingCreds.storeId != null ? String(existingCreds.storeId) : null);
  if (!storeId) throw new Error("storeId_required");

  const apiBaseUrl =
    parseOptionalString(body.apiBaseUrl) ??
    (typeof existingCreds.apiBaseUrl === "string" ? existingCreds.apiBaseUrl : null) ??
    DEFAULT_API_BASE_URL;

  const credentials = { apiBaseUrl, consumerKey, consumerSecret, storeId };

  const secretKey = resolveSecretDecryptionKey(process.env);
  const encryptedCredentialsJson = (
    secretKey ? encryptSecretJson(credentials, secretKey) : credentials
  ) as Json;

  let orgProviderAccountId = existing?.id ?? null;
  if (!orgProviderAccountId) {
    const { data: created, error: createErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .insert({
        org_id: orgId,
        provider_id: "atmos",
        environment,
        status,
        display_label: body.displayLabel ?? "Atmos",
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
        display_label: body.displayLabel ?? "Atmos",
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

  return NextResponse.json({ ok: true, method, orgProviderAccountId });
}

export async function POST(req: Request) {
  try {
    return await upsertProvider(req, "POST");
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_upsert_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    return await upsertProvider(req, "PATCH");
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_patch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
