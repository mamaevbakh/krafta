import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { revalidateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import { requireItemMediaRole } from "./_lib/authorize";

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
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Service-role writes below bypass RLS, so the caller must be authorized
  // here: signed in + owner/admin on the org owning the item's catalog
  // (the same gate the item_media RLS policies enforce).
  const auth = await requireItemMediaRole(supabase, itemId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: lastMedia, error: lastMediaError } = await supabase
    .from("item_media")
    .select("position")
    .eq("item_id", itemId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed max-position read would silently reuse taken positions,
  // making the "first" photo nondeterministic. Fail loudly.
  if (lastMediaError) {
    return NextResponse.json(
      { error: lastMediaError.message ?? "Failed to load media." },
      { status: 500 },
    );
  }

  const basePosition = lastMedia?.position ?? 0;

  // Main-photo contract: the main photo is the FIRST one. New uploads
  // APPEND to the gallery, so they never steal main from an existing
  // photo — the first upload only becomes primary when the item doesn't
  // have a primary yet (first-ever photo, or drifted data).
  const { data: existingPrimary, error: primaryProbeError } = await supabase
    .from("item_media")
    .select("id")
    .eq("item_id", itemId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  // A failed probe can't tell us whether a primary exists; promoting
  // blind would insert a second is_primary row (unique-index violation)
  // or steal the cover. Fail loudly instead.
  if (primaryProbeError) {
    return NextResponse.json(
      { error: primaryProbeError.message ?? "Failed to load media." },
      { status: 500 },
    );
  }

  const promoteFirstUpload = !existingPrimary;

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
    is_primary: promoteFirstUpload && index === 0,
    // Positions are ordinal-only (relative order matters, absolute
    // values don't): appends continue past the current max, while the
    // PATCH renumber paths write 0-based indices. Mixed bases are fine.
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

  if (promoteFirstUpload && insertRows[0]) {
    // Check the error explicitly — previously this awaited the result
    // and dropped any failure on the floor, which is how an entire
    // upload could return ok:true while items.image_path stayed NULL
    // (see KRA-88 search_sync trigger fix migration). Now: surface a
    // 500 so the client toasts the failure instead of believing the
    // upload "succeeded."
    const { error: itemUpdateError } = await supabase
      .from("items")
      .update({
        image_path: insertRows[0].storage_path,
        image_alt: insertRows[0].alt ?? null,
      })
      .eq("id", itemId);
    if (itemUpdateError) {
      return NextResponse.json(
        {
          error:
            itemUpdateError.message ??
            "Failed to update item with new photo.",
        },
        { status: 500 },
      );
    }
  }

  // Bust the catalog cache so the dashboard items page re-fetches with
  // the new media + image_path. Without this, router.refresh on the
  // client triggers an RSC re-render but the underlying cached fetch
  // serves stale data — the photo shows up on the customer page (which
  // reads via a different cache path) but not in the dashboard canvas.
  await revalidateCatalogByIdAndSlug({ catalogId: auth.catalogId });

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
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Same gate as POST — service-role writes need explicit authorization.
  const auth = await requireItemMediaRole(supabase, itemId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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

  const { data: remainingMedia, error: remainingError } = await supabase
    .from("item_media")
    .select("id, storage_path, alt, is_primary, position")
    .eq("item_id", itemId)
    .order("position", { ascending: true });

  // A swallowed error here would fall into the "no media left" branch
  // and NULL the item cover while photos still exist. Fail loudly.
  if (remainingError) {
    return NextResponse.json(
      { error: remainingError.message ?? "Failed to load media." },
      { status: 500 },
    );
  }

  if (!remainingMedia?.length) {
    await supabase
      .from("items")
      .update({ image_path: null, image_alt: null })
      .eq("id", itemId);
    await revalidateCatalogByIdAndSlug({ catalogId: auth.catalogId });
    return NextResponse.json({ ok: true, count: mediaRows.length });
  }

  let nextPrimary = remainingMedia.find((row) => row.is_primary);

  if (!nextPrimary) {
    nextPrimary = remainingMedia[0];
    const { error: demoteError } = await supabase
      .from("item_media")
      .update({ is_primary: false })
      .eq("item_id", itemId);
    if (demoteError) {
      return NextResponse.json(
        { error: demoteError.message ?? "Failed to update main photo." },
        { status: 500 },
      );
    }
    const { error: promoteError } = await supabase
      .from("item_media")
      .update({ is_primary: true })
      .eq("id", nextPrimary.id)
      .eq("item_id", itemId);
    if (promoteError) {
      return NextResponse.json(
        { error: promoteError.message ?? "Failed to update main photo." },
        { status: 500 },
      );
    }
  }

  if (nextPrimary && deletedPaths.has(nextPrimary.storage_path)) {
    nextPrimary = remainingMedia.find((row) => row.is_primary) ?? remainingMedia[0];
  }

  const { error: mirrorError } = await supabase
    .from("items")
    .update({
      image_path: nextPrimary.storage_path,
      image_alt: nextPrimary.alt ?? null,
    })
    .eq("id", itemId);

  if (mirrorError) {
    return NextResponse.json(
      { error: mirrorError.message ?? "Failed to update item cover." },
      { status: 500 },
    );
  }

  // Bust the catalog cache so the dashboard re-fetches with the
  // deleted-media state reflected. See POST handler comment above for
  // why this is required.
  await revalidateCatalogByIdAndSlug({ catalogId: auth.catalogId });

  return NextResponse.json({ ok: true, count: mediaRows.length });
}

/**
 * PATCH /api/items/media — two operations on the same route:
 *
 *   1. Set primary: body = { itemId, mediaId }
 *      Demotes the current primary, promotes the given media row,
 *      MOVES it to the front of the gallery, and mirrors its
 *      storage_path + alt onto items.image_path.
 *
 *   2. Reorder: body = { itemId, positions: [{ id, position }, ...] }
 *      Batch-updates the position column on item_media. Used by the
 *      photo-uploader drag-reorder gesture. Positions are the visible
 *      0-based index after the merchant's drag; the server doesn't
 *      assume monotonicity (the client supplies the full target list).
 *      After the update, the row in the FIRST position is promoted to
 *      primary and mirrored onto items.image_path.
 *
 * Both modes enforce the same invariant — the main photo IS the first
 * photo. Dragging a photo to the front makes it main; making a photo
 * main moves it to the front. Cards and the detail carousel lead with
 * the same image either way.
 *
 * The two modes are disjoint; presence of `positions` picks the second
 * mode regardless of mediaId.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    mediaId?: string;
    positions?: Array<{ id: string; position: number }>;
  } | null;

  const itemId = body?.itemId ?? "";
  const mediaId = body?.mediaId ?? "";
  const positions = body?.positions;

  if (!itemId) {
    return NextResponse.json(
      { error: "Missing media update data." },
      { status: 400 },
    );
  }

  if (
    (!positions || positions.length === 0) &&
    !mediaId
  ) {
    return NextResponse.json(
      { error: "Provide either mediaId (set primary) or positions (reorder)." },
      { status: 400 },
    );
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Same gate as POST — service-role writes need explicit authorization.
  const auth = await requireItemMediaRole(supabase, itemId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ----- REORDER MODE -------------------------------------------------
  if (positions && positions.length > 0) {
    // Issue N parallel UPDATEs scoped to (itemId, id). Each is a single-
    // column write so the bump_version trigger fires once per row — same
    // semantics as reorder_items / reorder_categories. RLS bypassed
    // (service role), but the (item_id, id) constraint prevents writes
    // to media owned by another item.
    const updates = await Promise.all(
      positions.map((p) =>
        supabase
          .from("item_media")
          .update({ position: p.position })
          .eq("id", p.id)
          .eq("item_id", itemId),
      ),
    );

    const firstError = updates.find((r) => r.error)?.error;
    if (firstError) {
      return NextResponse.json(
        { error: firstError.message ?? "Failed to reorder photos." },
        { status: 500 },
      );
    }

    // Main = first: whatever row now leads the gallery becomes the
    // primary and is mirrored onto items.image_path. Queried from the
    // table (not the payload) so a partial positions list can't
    // desync the invariant.
    const { data: firstRow, error: firstRowError } = await supabase
      .from("item_media")
      .select("id, storage_path, alt, is_primary")
      .eq("item_id", itemId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    // A swallowed read error here would skip the promote+mirror and
    // return ok:true with the invariant broken — fail loudly instead.
    if (firstRowError) {
      return NextResponse.json(
        { error: firstRowError.message ?? "Failed to update main photo." },
        { status: 500 },
      );
    }

    if (firstRow && !firstRow.is_primary) {
      // Demote failure must abort BEFORE the promote — otherwise a
      // failed demote + successful promote leaves two primary rows
      // (or, in the reverse order, zero) and the endpoint would still
      // report ok:true. Same for the cover mirror: a silent mirror
      // failure is exactly the stale-image_path desync KRA-88 fixed.
      const { error: demoteError } = await supabase
        .from("item_media")
        .update({ is_primary: false })
        .eq("item_id", itemId)
        .eq("is_primary", true);
      if (demoteError) {
        return NextResponse.json(
          { error: demoteError.message ?? "Failed to update main photo." },
          { status: 500 },
        );
      }
      const { error: promoteError } = await supabase
        .from("item_media")
        .update({ is_primary: true })
        .eq("id", firstRow.id)
        .eq("item_id", itemId);
      if (promoteError) {
        return NextResponse.json(
          { error: promoteError.message ?? "Failed to update main photo." },
          { status: 500 },
        );
      }
      const { error: mirrorError } = await supabase
        .from("items")
        .update({
          image_path: firstRow.storage_path,
          image_alt: firstRow.alt ?? null,
        })
        .eq("id", itemId);
      if (mirrorError) {
        return NextResponse.json(
          { error: mirrorError.message ?? "Failed to update item cover." },
          { status: 500 },
        );
      }
    }

    await revalidateCatalogByIdAndSlug({ catalogId: auth.catalogId });

    return NextResponse.json({ ok: true });
  }

  // ----- SET PRIMARY MODE ---------------------------------------------
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

  // Demote failure aborts before the promote — see the reorder-mode
  // block above for why the order matters.
  const { error: demoteError } = await supabase
    .from("item_media")
    .update({ is_primary: false })
    .eq("item_id", itemId)
    .eq("is_primary", true);

  if (demoteError) {
    return NextResponse.json(
      { error: demoteError.message ?? "Failed to update media." },
      { status: 500 },
    );
  }

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

  // Main = first: the new primary moves to the front of the gallery so
  // the dashboard grid, catalog cards, and the detail carousel all lead
  // with the same photo. Renumber every row (target first, then the
  // rest in their existing order) — same parallel-update pattern as
  // reorder mode.
  const { data: orderedRows, error: orderedRowsError } = await supabase
    .from("item_media")
    .select("id")
    .eq("item_id", itemId)
    .order("position", { ascending: true });

  // Same fail-loud rule as reorder mode: skipping the renumber on a
  // swallowed read would leave the new main photo mid-gallery.
  if (orderedRowsError) {
    return NextResponse.json(
      { error: orderedRowsError.message ?? "Failed to reorder photos." },
      { status: 500 },
    );
  }

  // Skip the renumber when the target already leads the gallery — a
  // no-op "set as main" click shouldn't cost N row writes.
  if (orderedRows && orderedRows.length > 1 && orderedRows[0]?.id !== mediaId) {
    const reordered = [
      mediaId,
      ...orderedRows.map((row) => row.id).filter((id) => id !== mediaId),
    ];
    const positionUpdates = await Promise.all(
      reordered.map((id, index) =>
        supabase
          .from("item_media")
          .update({ position: index })
          .eq("id", id)
          .eq("item_id", itemId),
      ),
    );
    const positionError = positionUpdates.find((r) => r.error)?.error;
    if (positionError) {
      return NextResponse.json(
        { error: positionError.message ?? "Failed to reorder photos." },
        { status: 500 },
      );
    }
  }

  const { error: mirrorError } = await supabase
    .from("items")
    .update({
      image_path: mediaRow.storage_path,
      image_alt: mediaRow.alt ?? null,
    })
    .eq("id", itemId);

  if (mirrorError) {
    return NextResponse.json(
      { error: mirrorError.message ?? "Failed to update item cover." },
      { status: 500 },
    );
  }

  // Bust the catalog cache so the dashboard reflects the new primary.
  // See POST handler comment for why this is required.
  await revalidateCatalogByIdAndSlug({ catalogId: auth.catalogId });

  return NextResponse.json({ ok: true });
}
