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

type UpsertBody = {
  orgId: string;
  environment?: "test" | "live";
  displayLabel?: string;
  apiBaseUrl: string;
  terminalId: string;
  apiKey: string;
  contentLanguage?: "ru-RU" | "uz-UZ" | "en-EN";
  webhookSecret?: string;
  status?: "active" | "disabled";
  fiscalCountry?: string;
  taxIdentityType?: "TIN" | "PINFL";
  taxIdentityValue?: string;
};
const UZ_SCHEMA_CODE = "UZ_AUTOFISCAL_V1";

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

function parseTaxIdentityType(value: unknown): "TIN" | "PINFL" | null {
  if (value !== "TIN" && value !== "PINFL") return null;
  return value;
}

function extractFiscalization(
  metadata: unknown,
): {
  country: string | null;
  taxIdentityType: "TIN" | "PINFL" | null;
  taxIdentityValue: string | null;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { country: null, taxIdentityType: null, taxIdentityValue: null };
  }

  const fiscalization = (metadata as Record<string, unknown>).fiscalization;
  if (
    !fiscalization ||
    typeof fiscalization !== "object" ||
    Array.isArray(fiscalization)
  ) {
    return { country: null, taxIdentityType: null, taxIdentityValue: null };
  }

  const fiscal = fiscalization as Record<string, unknown>;
  const country = parseOptionalString(fiscal.country);

  let taxIdentityType: "TIN" | "PINFL" | null = null;
  let taxIdentityValue: string | null = null;
  if (
    fiscal.taxIdentity &&
    typeof fiscal.taxIdentity === "object" &&
    !Array.isArray(fiscal.taxIdentity)
  ) {
    const taxIdentity = fiscal.taxIdentity as Record<string, unknown>;
    taxIdentityType = parseTaxIdentityType(taxIdentity.type);
    taxIdentityValue = parseOptionalString(taxIdentity.value);
  }

  return { country, taxIdentityType, taxIdentityValue };
}

async function ensureSchemaByCode(admin: any, code: string) {
  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("tax_schemas")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await admin
    .schema("payments")
    .from("tax_schemas")
    .insert({
      code,
      name: "Uzbekistan Autofiscalization",
      country_iso2: "UZ",
      version: "v1",
      is_active: true,
      metadata: {},
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id as string;
}

async function getOrgTaxProfile(admin: any, orgId: string) {
  const { data: profile, error: profileErr } = await admin
    .schema("payments")
    .from("org_tax_profiles")
    .select("country_iso2, schema_id, tax_identity_type, tax_identity_value")
    .eq("org_id", orgId)
    .maybeSingle();
  if (profileErr && profileErr.code !== "PGRST205") throw profileErr;
  if (!profile) return null;

  let schemaCode: string | null = null;
  if (profile.schema_id) {
    const { data: schema, error: schemaErr } = await admin
      .schema("payments")
      .from("tax_schemas")
      .select("code")
      .eq("id", profile.schema_id)
      .maybeSingle();
    if (schemaErr && schemaErr.code !== "PGRST205") throw schemaErr;
    schemaCode = typeof schema?.code === "string" ? schema.code : null;
  }

  return {
    country: typeof profile.country_iso2 === "string" ? profile.country_iso2 : null,
    schema: schemaCode,
    taxIdentityType: parseTaxIdentityType(profile.tax_identity_type),
    taxIdentityValue: parseOptionalString(profile.tax_identity_value),
  };
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseString(url.searchParams.get("orgId"), "orgId");
    const environment = (url.searchParams.get("environment") ?? "live") as "test" | "live";

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();
    const { data: account, error: accountErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .select("id, status, display_label, environment, metadata")
      .eq("org_id", orgId)
      .eq("provider_id", "uzum")
      .eq("environment", environment)
      .maybeSingle();
    if (accountErr) throw accountErr;

    if (!account) {
      return NextResponse.json({ configured: false });
    }

    const { data: secrets, error: secretsErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .select("credentials_encrypted, webhook_secret_encrypted")
      .eq("org_provider_account_id", account.id)
      .maybeSingle();
    if (secretsErr) throw secretsErr;

    const credentials = decryptSecretJsonMaybe(secrets?.credentials_encrypted ?? {});
    const rec = credentials && typeof credentials === "object"
      ? (credentials as Record<string, unknown>)
      : {};

    const webhookSecret = decryptSecretJsonMaybe(secrets?.webhook_secret_encrypted ?? null);
    const adminAny = admin as any;
    const profileFiscal = await getOrgTaxProfile(adminAny, orgId);
    const metadataFiscal = extractFiscalization(account.metadata);
    const fiscal = {
      country: profileFiscal?.country ?? metadataFiscal.country,
      taxIdentityType: profileFiscal?.taxIdentityType ?? metadataFiscal.taxIdentityType,
      taxIdentityValue: profileFiscal?.taxIdentityValue ?? metadataFiscal.taxIdentityValue,
    };

    return NextResponse.json({
      configured: true,
      account: {
        id: account.id,
        status: account.status,
        environment: account.environment,
        displayLabel: account.display_label,
      },
      credentials: {
        apiBaseUrl: typeof rec.apiBaseUrl === "string" ? rec.apiBaseUrl : null,
        terminalId: typeof rec.terminalId === "string" ? rec.terminalId : null,
        hasApiKey: Boolean(rec.apiKey),
        hasWebhookSecret: Boolean(
          typeof webhookSecret === "string"
            ? webhookSecret
            : webhookSecret && typeof webhookSecret === "object",
        ),
      },
      fiscalization: fiscal,
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
  await requireOrgMembership({
    supabase,
    userId: user.id,
    orgId,
    minRole: "admin",
  });

  const environment = body.environment ?? "live";
  const status = body.status ?? "active";
  const admin = createAdminSupabase();

  const { data: existing, error: existingErr } = await admin
    .schema("payments")
    .from("org_provider_accounts")
    .select("id, metadata")
    .eq("org_id", orgId)
    .eq("provider_id", "uzum")
    .eq("environment", environment)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const existingMetadata =
    existing?.metadata &&
    typeof existing.metadata === "object" &&
    !Array.isArray(existing.metadata)
      ? ({ ...(existing.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const existingFiscal = extractFiscalization(existingMetadata);

  const fiscalCountry =
    parseOptionalString(body.fiscalCountry) ?? existingFiscal.country ?? "UZ";
  const taxIdentityType =
    parseTaxIdentityType(body.taxIdentityType) ?? existingFiscal.taxIdentityType;
  const taxIdentityValue =
    parseOptionalString(body.taxIdentityValue) ?? existingFiscal.taxIdentityValue;

  if (!taxIdentityType || !taxIdentityValue) {
    throw new Error("tax_identity_required");
  }

  const mergedFiscalization = {
    country: fiscalCountry,
    schema: "UZ_AUTOFISCAL_V1",
    taxIdentity: {
      type: taxIdentityType,
      value: taxIdentityValue,
    },
  };
  const mergedMetadata = {
    ...existingMetadata,
    stage1: true,
    fiscalization: mergedFiscalization,
  };
  const adminAny = admin as any;
  const schemaId = await ensureSchemaByCode(adminAny, UZ_SCHEMA_CODE);

  let existingCredentialsRecord: Record<string, unknown> = {};
  let existingWebhookSecretValue: string | null = null;
  if (existing?.id) {
    const { data: existingSecrets, error: existingSecretsErr } = await admin
      .schema("payments")
      .from("org_provider_account_secrets")
      .select("credentials_encrypted, webhook_secret_encrypted")
      .eq("org_provider_account_id", existing.id)
      .maybeSingle();
    if (existingSecretsErr) throw existingSecretsErr;

    const decryptedCredentials = decryptSecretJsonMaybe(
      existingSecrets?.credentials_encrypted ?? {},
    );
    if (decryptedCredentials && typeof decryptedCredentials === "object") {
      existingCredentialsRecord = decryptedCredentials as Record<string, unknown>;
    }

    const decryptedWebhookSecret = decryptSecretJsonMaybe(
      existingSecrets?.webhook_secret_encrypted ?? null,
    );
    if (typeof decryptedWebhookSecret === "string" && decryptedWebhookSecret.trim()) {
      existingWebhookSecretValue = decryptedWebhookSecret.trim();
    } else if (
      decryptedWebhookSecret &&
      typeof decryptedWebhookSecret === "object" &&
      !Array.isArray(decryptedWebhookSecret)
    ) {
      const candidate = parseOptionalString(
        (decryptedWebhookSecret as Record<string, unknown>).webhookSecret,
      );
      existingWebhookSecretValue = candidate;
    }
  }

  const apiKeyValue =
    parseOptionalString(body.apiKey) ??
    (typeof existingCredentialsRecord.apiKey === "string"
      ? existingCredentialsRecord.apiKey
      : null);
  if (!apiKeyValue) {
    throw new Error("apiKey_required");
  }

  const webhookSecretValue = parseOptionalString(body.webhookSecret) ?? existingWebhookSecretValue;

  const credentials = {
    apiBaseUrl: parseString(body.apiBaseUrl, "apiBaseUrl"),
    terminalId: parseString(body.terminalId, "terminalId"),
    apiKey: apiKeyValue,
    contentLanguage: body.contentLanguage ?? "ru-RU",
  };

  const secretKey = resolveSecretDecryptionKey(process.env);
  const encryptedCredentials = secretKey
    ? encryptSecretJson(credentials, secretKey)
    : credentials;
  const encryptedWebhookSecret = webhookSecretValue
    ? secretKey
      ? encryptSecretJson({ webhookSecret: webhookSecretValue }, secretKey)
      : { webhookSecret: webhookSecretValue }
    : null;
  const encryptedCredentialsJson = encryptedCredentials as Json;
  const encryptedWebhookSecretJson = encryptedWebhookSecret as Json | null;

  let orgProviderAccountId = existing?.id ?? null;
  if (!orgProviderAccountId) {
    const { data: created, error: createErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .insert({
        org_id: orgId,
        provider_id: "uzum",
        environment,
        status,
        display_label: body.displayLabel ?? "Uzum",
        metadata: mergedMetadata,
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
        display_label: body.displayLabel ?? "Uzum",
        metadata: mergedMetadata,
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
        webhook_secret_encrypted: encryptedWebhookSecretJson,
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
          webhook_secret_encrypted: encryptedWebhookSecretJson,
        },
      ]);
    if (secretsInsertErr) throw secretsInsertErr;
  }

  const { error: taxProfileErr } = await adminAny
    .schema("payments")
    .from("org_tax_profiles")
    .upsert(
      {
        org_id: orgId,
        country_iso2: fiscalCountry,
        schema_id: schemaId,
        tax_identity_type: taxIdentityType,
        tax_identity_value: taxIdentityValue,
        metadata: {
          source: "provider_dashboard",
          provider_id: "uzum",
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  if (taxProfileErr && taxProfileErr.code !== "PGRST205") throw taxProfileErr;

  return NextResponse.json({
    ok: true,
    method,
    orgProviderAccountId,
  });
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

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseString(url.searchParams.get("orgId"), "orgId");
    const environment = (url.searchParams.get("environment") ?? "live") as "test" | "live";
    await requireOrgMembership({ supabase, userId: user.id, orgId, minRole: "admin" });

    const admin = createAdminSupabase();
    const { data: account, error: accErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .select("id")
      .eq("org_id", orgId)
      .eq("provider_id", "uzum")
      .eq("environment", environment)
      .maybeSingle();
    if (accErr) throw accErr;
    if (!account) return NextResponse.json({ ok: true, deleted: false });

    // Secrets cascade on delete. payment_attempts / payment_methods are NO ACTION,
    // so an account with payment history raises a FK violation (23503) — we surface
    // that as "in use" rather than destroying audit records.
    const { error: delErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .delete()
      .eq("id", account.id);
    if (delErr) {
      if ((delErr as { code?: string }).code === "23503") {
        return NextResponse.json({ error: "provider_in_use" }, { status: 409 });
      }
      throw delErr;
    }
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
