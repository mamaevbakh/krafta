import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";
import { decryptSecretJsonMaybe } from "@krafta/payments-core";
import { upsertAtmosProviderAccount } from "@/lib/providers/atmos-connect";

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
  const admin = createAdminSupabase();

  const { orgProviderAccountId } = await upsertAtmosProviderAccount(admin, {
    orgId,
    environment,
    consumerKey: parseOptionalString(body.consumerKey),
    consumerSecret: parseOptionalString(body.consumerSecret),
    storeId: parseOptionalString(body.storeId),
    apiBaseUrl: parseOptionalString(body.apiBaseUrl),
    displayLabel: body.displayLabel ?? null,
    status: body.status ?? "active",
  });

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
      .eq("provider_id", "atmos")
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
