import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const BUCKET_NAME = "krafta";

function sanitizeFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "banner";
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.length ? normalized : "banner";
}

function getServiceClient() {
  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function canRemovePreviousPath(
  path: string,
  orgId: string,
  catalogId: string,
): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  return trimmed.startsWith(`org/${orgId}/catalog/${catalogId}/header-banner/`);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const catalogId = String(formData.get("catalogId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const variant = String(formData.get("variant") ?? "");
  const previousPath = String(formData.get("previousPath") ?? "");
  const bannerFile = formData.get("banner");

  if (
    !catalogId ||
    !orgId ||
    (variant !== "light" && variant !== "dark") ||
    !(bannerFile instanceof File)
  ) {
    return NextResponse.json(
      { error: "Missing catalog banner upload data." },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("catalogs")
    .select("id, org_id")
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

  if (canRemovePreviousPath(previousPath, orgId, catalogId)) {
    await supabase.storage.from(BUCKET_NAME).remove([previousPath]);
  }

  const bannerId = crypto.randomUUID();
  const safeFilename = sanitizeFilename(bannerFile.name);
  const storagePath =
    `org/${orgId}/catalog/${catalogId}/header-banner/${variant}/${bannerId}/${safeFilename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, bannerFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: bannerFile.type || undefined,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? "Failed to upload banner image." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, bannerPath: storagePath });
}
