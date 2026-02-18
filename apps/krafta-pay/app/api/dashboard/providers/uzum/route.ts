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
};

function parseString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field}_required`);
  }
  return value.trim();
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
      .select("id, status, display_label, environment")
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
    .select("id")
    .eq("org_id", orgId)
    .eq("provider_id", "uzum")
    .eq("environment", environment)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const credentials = {
    apiBaseUrl: parseString(body.apiBaseUrl, "apiBaseUrl"),
    terminalId: parseString(body.terminalId, "terminalId"),
    apiKey: parseString(body.apiKey, "apiKey"),
    contentLanguage: body.contentLanguage ?? "ru-RU",
  };

  const secretKey = resolveSecretDecryptionKey(process.env);
  const encryptedCredentials = secretKey
    ? encryptSecretJson(credentials, secretKey)
    : credentials;
  const encryptedWebhookSecret = body.webhookSecret
    ? secretKey
      ? encryptSecretJson({ webhookSecret: body.webhookSecret }, secretKey)
      : { webhookSecret: body.webhookSecret }
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
        metadata: { stage1: true },
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
