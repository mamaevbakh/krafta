import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const BUCKET_NAME = "public-assets";

function sanitizeFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "file";
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.length ? normalized : "file";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    orgId?: string;
    catalogId?: string;
    files?: Array<{
      name?: string;
      type?: string;
      size?: number;
    }>;
  } | null;

  const itemId = body?.itemId ?? "";
  const orgId = body?.orgId ?? "";
  const catalogId = body?.catalogId ?? "";
  const files = body?.files ?? [];

  if (!itemId || !orgId || !catalogId || files.length === 0) {
    return NextResponse.json(
      { error: "Missing required upload data." },
      { status: 400 },
    );
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

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

  try {
    const uploads = await Promise.all(
      files.map(async (file) => {
        const mediaId = crypto.randomUUID();
        const safeFilename = sanitizeFilename(file.name ?? "file");
        const storagePath = `org/${orgId}/catalog/${catalogId}/item/${itemId}/media/${mediaId}/${safeFilename}`;

        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUploadUrl(storagePath);

        if (error || !data) {
          throw new Error(error?.message ?? "Failed to create upload URL.");
        }

        const mimeType = file.type ?? "";
        const kind = mimeType.startsWith("video") ? "video" : "image";

        return {
          id: mediaId,
          bucket: BUCKET_NAME,
          storagePath,
          token: data.token,
          signedUrl: data.signedUrl,
          kind,
          mimeType: mimeType || null,
          bytes: file.size ?? null,
        };
      }),
    );

    return NextResponse.json({ uploads });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to prepare uploads.",
      },
      { status: 500 },
    );
  }
}
