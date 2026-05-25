"use server";

/**
 * Tables CRUD server actions + paired QR auto-creation.
 *
 * Used by the /dashboard/[org]/[catalog]/qr-codes page. Each merchant
 * action that mutates a table also keeps the linked qr_codes row in
 * sync — creating a table also creates its paired QR; deleting a
 * table cascades to the QR (FK ON DELETE CASCADE in the migration).
 *
 * Auth: every action uses the request-scoped Supabase client, which
 * carries the merchant's session. RLS enforces org owner/admin write
 * on both public.tables and public.qr_codes. No service-role escape
 * here — if the merchant doesn't have permission, the action surfaces
 * the RLS error verbatim.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

// ============================================================================
// createTable + paired QR
// ============================================================================

const createTableSchema = z.object({
  venueId: uuidSchema,
  label: z.string().trim().min(1).max(64),
  catalogSlug: z.string().min(1),
});

type CreateTableResult =
  | { ok: true; tableId: string; qrId: string; shortcode: string }
  | { ok: false; error: string };

export async function createTable(
  input: z.input<typeof createTableSchema>,
): Promise<CreateTableResult> {
  const parsed = createTableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const { venueId, label, catalogSlug } = parsed.data;
  const supabase = await createClient();

  // Append-at-end position: SELECT max(position) and add 1. Cheap, no
  // contention since merchants rarely create tables in parallel.
  const { data: maxRow } = await supabase
    .from("tables")
    .select("position")
    .eq("venue_id", venueId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.position ?? -1) + 1;

  // Insert the table. org_id is auto-synced via tables_sync_org_id trigger.
  const { data: created, error: createErr } = await supabase
    .from("tables")
    .insert({
      org_id: "00000000-0000-0000-0000-000000000000", // overwritten by trigger
      venue_id: venueId,
      label,
      position: nextPosition,
    })
    .select("id, org_id, venue_id")
    .single();

  if (createErr || !created) {
    // 23505 = partial UNIQUE on (venue_id, label) WHERE is_active fired.
    if (createErr?.code === "23505") {
      return { ok: false, error: `A table named "${label}" already exists.` };
    }
    return { ok: false, error: createErr?.message ?? "Failed to create table." };
  }

  // Paired QR. catalog_id + org_id are auto-synced by qr_codes_sync_from_venue.
  const { data: qr, error: qrErr } = await supabase
    .from("qr_codes")
    .insert({
      org_id: created.org_id,
      venue_id: created.venue_id,
      catalog_id: "00000000-0000-0000-0000-000000000000", // trigger fills
      kind: "table",
      table_id: created.id,
      // shortcode + table_label default to NULL; the resolver prefers
      // the joined tables.label so table_label can stay null.
    })
    .select("id, shortcode")
    .single();

  if (qrErr || !qr) {
    // Roll the table back so a partial state doesn't strand the merchant.
    await supabase.from("tables").delete().eq("id", created.id);
    return { ok: false, error: qrErr?.message ?? "Failed to create paired QR." };
  }

  revalidatePath(`/dashboard/[orgSlug]/${catalogSlug}/qr-codes`, "page");

  return { ok: true, tableId: created.id, qrId: qr.id, shortcode: qr.shortcode };
}

// ============================================================================
// updateTable (rename / reposition / activate-toggle)
// ============================================================================

const updateTableSchema = z.object({
  tableId: uuidSchema,
  catalogSlug: z.string().min(1),
  label: z.string().trim().min(1).max(64).optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function updateTable(
  input: z.input<typeof updateTableSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateTableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const { tableId, catalogSlug, label, position, isActive } = parsed.data;
  if (label === undefined && position === undefined && isActive === undefined) {
    return { ok: false, error: "Nothing to update." };
  }
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (position !== undefined) updates.position = position;
  if (isActive !== undefined) updates.is_active = isActive;

  const { error } = await supabase
    .from("tables")
    .update(updates)
    .eq("id", tableId);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `A table named "${label}" already exists.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/dashboard/[orgSlug]/${catalogSlug}/qr-codes`, "page");
  return { ok: true };
}

// ============================================================================
// deleteTable — hard delete, cascades to paired qr_codes row
// ============================================================================

const deleteTableSchema = z.object({
  tableId: uuidSchema,
  catalogSlug: z.string().min(1),
});

export async function deleteTable(
  input: z.input<typeof deleteTableSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteTableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .delete()
    .eq("id", parsed.data.tableId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/[orgSlug]/${parsed.data.catalogSlug}/qr-codes`, "page");
  return { ok: true };
}

// ============================================================================
// regenerateQrShortcode — invalidate the printed QR by rolling the shortcode
// ============================================================================

const regenerateSchema = z.object({
  qrId: uuidSchema,
  catalogSlug: z.string().min(1),
});

export async function regenerateQrShortcode(
  input: z.input<typeof regenerateSchema>,
): Promise<{ ok: true; shortcode: string } | { ok: false; error: string }> {
  const parsed = regenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const supabase = await createClient();

  // 8-char hex (4 bytes = 32 bits, ~4B permutations). The qr_codes
  // shortcode column is partial UNIQUE; we retry once on the rare
  // 23505 collision and give up after that — caller can re-fire.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const shortcode = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await supabase
      .from("qr_codes")
      .update({ shortcode })
      .eq("id", parsed.data.qrId);

    if (!error) {
      revalidatePath(`/dashboard/[orgSlug]/${parsed.data.catalogSlug}/qr-codes`, "page");
      return { ok: true, shortcode };
    }
    if (error.code !== "23505") return { ok: false, error: error.message };
    // Collision — fall through and retry with a fresh shortcode.
  }
  return { ok: false, error: "Failed to generate unique shortcode after retry." };
}
