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
  const formData = await request.formData();
  const itemId = String(formData.get("itemId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "");
  const imageAlt = String(formData.get("imageAlt") ?? "");
  const files = formData.getAll("media").filter((entry) => entry instanceof File) as File[];

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

  const { data: lastMedia } = await supabase
    .from("item_media")
    .select("position")
    .eq("item_id", itemId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const basePosition = lastMedia?.position ?? 0;

  await supabase
    .from("item_media")
    .update({ is_primary: false })
    .eq("item_id", itemId)
    .eq("is_primary", true);

  const uploads = await Promise.all(
    files.map(async (file, index) => {
      const mediaId = crypto.randomUUID();
      const safeFilename = sanitizeFilename(file.name);
      const storagePath = `org/${orgId}/catalog/${catalogId}/item/${itemId}/media/${mediaId}/${safeFilename}`;

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        throw new Error(error.message);
      }

      return {
        id: mediaId,
        item_id: itemId,
        bucket: BUCKET_NAME,
        storage_path: storagePath,
        kind: file.type.startsWith("video") ? "video" : "image",
        mime_type: file.type || null,
        bytes: file.size,
        alt: imageAlt || null,
        title: title || null,
        is_primary: index === 0,
        position: basePosition + index + 1,
      };
    }),
  );

  const { error: mediaError } = await supabase.from("item_media").insert(uploads);
  if (mediaError) {
    return NextResponse.json(
      { error: mediaError.message ?? "Failed to save media." },
      { status: 500 },
    );
  }

  if (uploads[0]) {
    await supabase
      .from("items")
      .update({
        image_path: uploads[0].storage_path,
        image_alt: uploads[0].alt ?? null,
      })
      .eq("id", itemId);
  }

  return NextResponse.json({ ok: true, count: uploads.length });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    mediaIds?: string[];
  } | null;

  const itemId = body?.itemId ?? "";
  const mediaIds = body?.mediaIds ?? [];

  if (!itemId || mediaIds.length === 0) {
    return NextResponse.json(
      { error: "Missing media delete data." },
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

  const { data: mediaRows, error: fetchError } = await supabase
    .from("item_media")
    .select("id, storage_path, bucket")
    .eq("item_id", itemId)
    .in("id", mediaIds);

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message ?? "Failed to load media." },
      { status: 500 },
    );
  }

  if (!mediaRows?.length) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const grouped: Record<string, string[]> = {};
  mediaRows.forEach((row) => {
    if (!grouped[row.bucket]) grouped[row.bucket] = [];
    grouped[row.bucket].push(row.storage_path);
  });

  await Promise.all(
    Object.entries(grouped).map(([bucket, paths]) =>
      supabase.storage.from(bucket).remove(paths),
    ),
  );

  const { error: deleteError } = await supabase
    .from("item_media")
    .delete()
    .eq("item_id", itemId)
    .in("id", mediaIds);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message ?? "Failed to delete media." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, count: mediaRows.length });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    mediaId?: string;
  } | null;

  const itemId = body?.itemId ?? "";
  const mediaId = body?.mediaId ?? "";

  if (!itemId || !mediaId) {
    return NextResponse.json(
      { error: "Missing media update data." },
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

  const { data: mediaRow, error: mediaError } = await supabase
    .from("item_media")
    .select("id, storage_path, alt")
    .eq("item_id", itemId)
    .eq("id", mediaId)
    .maybeSingle();

  if (mediaError || !mediaRow) {
    return NextResponse.json(
      { error: mediaError?.message ?? "Media not found." },
      { status: 404 },
    );
  }

  await supabase
    .from("item_media")
    .update({ is_primary: false })
    .eq("item_id", itemId)
    .eq("is_primary", true);

  const { error: updateError } = await supabase
    .from("item_media")
    .update({ is_primary: true })
    .eq("id", mediaId)
    .eq("item_id", itemId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to update media." },
      { status: 500 },
    );
  }

  await supabase
    .from("items")
    .update({
      image_path: mediaRow.storage_path,
      image_alt: mediaRow.alt ?? null,
    })
    .eq("id", itemId);

  return NextResponse.json({ ok: true });
}
