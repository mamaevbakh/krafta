import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import type { Database } from "@/lib/supabase/types";

const BUCKET_NAME = "krafta";

/**
 * Verifies the caller's session owns the org before any service-role mutation.
 * The service client bypasses RLS, so the only authorization gate is here: we
 * confirm an owner/admin organization_members row for the authenticated user
 * via the cookie-scoped client. The onboarding wizard calls this right after
 * creating the shop (caller IS the owner), and the dashboard Settings panel
 * runs as the signed-in merchant — both satisfy this check. Returns a
 * NextResponse to short-circuit on failure, or null when authorized.
 */
async function authorizeOrgOwner(orgId: string): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { user, authError } = await getUserSafely(supabase);
  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json(
      { error: membershipError.message },
      { status: 500 },
    );
  }

  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to this organization." },
      { status: 403 },
    );
  }

  return null;
}

function sanitizeFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "logo";
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.length ? normalized : "logo";
}

function getServiceClient() {
  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const catalogId = String(formData.get("catalogId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const logoFile = formData.get("logo");

  if (!catalogId || !orgId || !(logoFile instanceof File)) {
    return NextResponse.json(
      { error: "Missing catalog logo data." },
      { status: 400 },
    );
  }

  const denied = await authorizeOrgOwner(orgId);
  if (denied) return denied;

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("catalogs")
    .select("logo_path, org_id")
    .eq("id", catalogId)
    .maybeSingle();

  if (catalogError || !catalog) {
    return NextResponse.json(
      { error: catalogError?.message ?? "Catalog not found." },
      { status: 404 },
    );
  }

  if (catalog.org_id !== orgId) {
    return NextResponse.json(
      { error: "Catalog does not belong to this organization." },
      { status: 403 },
    );
  }

  if (catalog.logo_path) {
    await supabase.storage.from(BUCKET_NAME).remove([catalog.logo_path]);
  }

  const logoId = crypto.randomUUID();
  const safeFilename = sanitizeFilename(logoFile.name);
  const storagePath = `org/${orgId}/catalog/${catalogId}/logo/${logoId}/${safeFilename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, logoFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: logoFile.type || undefined,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? "Failed to upload logo." },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabase
    .from("catalogs")
    .update({ logo_path: storagePath })
    .eq("id", catalogId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to save logo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, logoPath: storagePath });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    catalogId?: string;
    orgId?: string;
  } | null;

  const catalogId = body?.catalogId ?? "";
  const orgId = body?.orgId ?? "";

  if (!catalogId || !orgId) {
    return NextResponse.json(
      { error: "Missing catalog logo data." },
      { status: 400 },
    );
  }

  const denied = await authorizeOrgOwner(orgId);
  if (denied) return denied;

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("catalogs")
    .select("logo_path, org_id")
    .eq("id", catalogId)
    .maybeSingle();

  if (catalogError || !catalog) {
    return NextResponse.json(
      { error: catalogError?.message ?? "Catalog not found." },
      { status: 404 },
    );
  }

  if (catalog.org_id !== orgId) {
    return NextResponse.json(
      { error: "Catalog does not belong to this organization." },
      { status: 403 },
    );
  }

  if (catalog.logo_path) {
    await supabase.storage.from(BUCKET_NAME).remove([catalog.logo_path]);
  }

  const { error: updateError } = await supabase
    .from("catalogs")
    .update({ logo_path: null })
    .eq("id", catalogId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to remove logo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
