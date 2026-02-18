import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";
import { generateApiKey, getRuntimePayEnvironment } from "@/lib/api-keys";

type ApiKeyBody = {
  orgId: string;
  keyId?: string;
  name?: string;
  environment?: "test" | "live";
};

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

function parseEnvironment(value: unknown): "test" | "live" {
  if (value === "live") return "live";
  if (value === "test") return "test";
  return getRuntimePayEnvironment();
}

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .schema("payments")
      .from("api_keys")
      .select("id, name, prefix, last4, environment, metadata, created_at, revoked_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ apiKeys: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "api_keys_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as ApiKeyBody;
    const orgId = parseOrgId(body.orgId);

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const environment = parseEnvironment(body.environment);
    const name = body.name?.trim() || `API key ${new Date().toISOString()}`;
    const generated = generateApiKey({ environment });
    const admin = createAdminSupabase();

    const { data, error } = await admin
      .schema("payments")
      .from("api_keys")
      .insert({
        org_id: orgId,
        name,
        environment,
        hashed_key: generated.hashedKey,
        prefix: generated.prefix,
        last4: generated.last4,
        metadata: {
          created_by_user_id: user.id,
        },
      })
      .select("id, name, prefix, last4, environment, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json(
      {
        ok: true,
        apiKey: data,
        token: generated.token,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "api_keys_create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const body = (await req.json()) as ApiKeyBody;
    const orgId = parseOrgId(body.orgId);
    if (!body.keyId) {
      return NextResponse.json({ error: "keyId is required" }, { status: 400 });
    }

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "admin",
    });

    const admin = createAdminSupabase();
    const { error } = await admin
      .schema("payments")
      .from("api_keys")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("id", body.keyId)
      .eq("org_id", orgId)
      .is("revoked_at", null);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "api_keys_revoke_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
