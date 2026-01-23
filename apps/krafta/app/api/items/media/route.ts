import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const BUCKET_NAME = "public-assets";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    uploads?: Array<{
      id: string;
      bucket?: string;
      storage_path: string;
      kind: Database["public"]["Enums"]["item_media_kind"];
      mime_type?: string | null;
      bytes?: number | null;
      title?: string | null;
      alt?: string | null;
    }>;
  } | null;

  const itemId = body?.itemId ?? "";
  const uploads = body?.uploads ?? [];

  if (!itemId || uploads.length === 0) {
    return NextResponse.json(
      { error: "Missing required media data." },
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

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item) {
    return NextResponse.json(
      { error: itemError?.message ?? "Item not found." },
      { status: 404 },
    );
  }

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

  const insertRows = uploads.map((upload, index) => ({
    id: upload.id,
    item_id: itemId,
    bucket: upload.bucket ?? BUCKET_NAME,
    storage_path: upload.storage_path,
    kind: upload.kind,
    mime_type: upload.mime_type ?? null,
    bytes: upload.bytes ?? null,
    alt: upload.alt ?? null,
    title: upload.title ?? null,
    is_primary: index === 0,
    position: basePosition + index + 1,
  })) satisfies Database["public"]["Tables"]["item_media"]["Insert"][];

  const { error: mediaError } = await supabase
    .from("item_media")
    .insert(insertRows);
  if (mediaError) {
    return NextResponse.json(
      { error: mediaError.message ?? "Failed to save media." },
      { status: 500 },
    );
  }

  if (insertRows[0]) {
    await supabase
      .from("items")
      .update({
        image_path: insertRows[0].storage_path,
        image_alt: insertRows[0].alt ?? null,
      })
      .eq("id", itemId);
  }

  return NextResponse.json({ ok: true, media: insertRows });
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
    .select("id, storage_path, bucket, is_primary")
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

  const deletedPaths = new Set(
    mediaRows.map((row) => row.storage_path),
  );

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

  const { data: remainingMedia } = await supabase
    .from("item_media")
    .select("id, storage_path, alt, is_primary, position")
    .eq("item_id", itemId)
    .order("position", { ascending: true });

  if (!remainingMedia?.length) {
    await supabase
      .from("items")
      .update({ image_path: null, image_alt: null })
      .eq("id", itemId);
    return NextResponse.json({ ok: true, count: mediaRows.length });
  }

  let nextPrimary = remainingMedia.find((row) => row.is_primary);

  if (!nextPrimary) {
    nextPrimary = remainingMedia[0];
    await supabase
      .from("item_media")
      .update({ is_primary: false })
      .eq("item_id", itemId);
    await supabase
      .from("item_media")
      .update({ is_primary: true })
      .eq("id", nextPrimary.id)
      .eq("item_id", itemId);
  }

  if (nextPrimary && deletedPaths.has(nextPrimary.storage_path)) {
    nextPrimary = remainingMedia.find((row) => row.is_primary) ?? remainingMedia[0];
  }

  await supabase
    .from("items")
    .update({
      image_path: nextPrimary.storage_path,
      image_alt: nextPrimary.alt ?? null,
    })
    .eq("id", itemId);

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
