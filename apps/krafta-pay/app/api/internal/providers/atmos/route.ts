import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { parseAtmosCredentials, verifyAtmosCredentials } from "@krafta/payments-core";
import {
  disableAtmosProviderAccount,
  resolvePayEnvironment,
  upsertAtmosProviderAccount,
} from "@/lib/providers/atmos-connect";

// Internal (server-to-server, HMAC-signed) endpoint that lets the main Krafta
// app connect a MERCHANT's own Atmos account on their behalf (BYOA). The main
// app is a trusted caller; `orgId` is the merchant's organization id (the same
// public.organizations row both apps share). Unlike the dashboard route, the
// caller here is not a logged-in Krafta Pay dashboard user, so auth is the
// shared internal secret + an optional org-admin membership check.

type ConnectBody = {
  orgId: string;
  consumerKey: string;
  consumerSecret: string;
  storeId: string;
  apiBaseUrl?: string;
  displayLabel?: string;
  // When supplied, the user must be an owner/admin of orgId (defense in depth;
  // the main app already gates this via RLS on its own settings write).
  initiatedByUserId?: string;
};

async function requireOrgAdminIfProvided(
  admin: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  userId?: string,
): Promise<boolean> {
  if (!userId) return true;
  const { data: membership, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const role = membership?.role;
  return role === "owner" || role === "admin";
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as ConnectBody;
    if (!body?.orgId || !body?.consumerKey || !body?.consumerSecret || !body?.storeId) {
      return NextResponse.json(
        { error: "orgId, consumerKey, consumerSecret and storeId are required" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabase();
    if (!(await requireOrgAdminIfProvided(admin, body.orgId, body.initiatedByUserId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const environment = resolvePayEnvironment();

    // Best-effort probe. Reject definitively-bad credentials; tolerate an
    // unreachable gateway (Atmos apigw is IP/geo-fenced) — the merchant is saved
    // as `verified: false` and the first real charge is the true validation.
    const creds = parseAtmosCredentials({
      apiBaseUrl: body.apiBaseUrl,
      consumerKey: body.consumerKey,
      consumerSecret: body.consumerSecret,
      storeId: body.storeId,
    });
    const verdict = await verifyAtmosCredentials(creds);
    if (!verdict.ok && verdict.reason === "auth_failed") {
      return NextResponse.json({ error: "atmos_credentials_rejected" }, { status: 400 });
    }

    const result = await upsertAtmosProviderAccount(admin, {
      orgId: body.orgId,
      environment,
      consumerKey: body.consumerKey,
      consumerSecret: body.consumerSecret,
      storeId: body.storeId,
      apiBaseUrl: body.apiBaseUrl ?? null,
      displayLabel: body.displayLabel ?? null,
      status: "active",
    });

    return NextResponse.json(
      {
        connected: true,
        environment,
        storeId: result.storeId,
        verified: verdict.ok,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "internal_atmos_connect_failed";
    console.error("internal atmos connect failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody || "{}") as {
      orgId?: string;
      initiatedByUserId?: string;
    };
    if (!body?.orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    if (!(await requireOrgAdminIfProvided(admin, body.orgId, body.initiatedByUserId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    await disableAtmosProviderAccount(admin, {
      orgId: body.orgId,
      environment: resolvePayEnvironment(),
    });

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "internal_atmos_disconnect_failed";
    console.error("internal atmos disconnect failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
