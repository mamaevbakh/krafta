import "server-only";

import { createClient } from "@/lib/supabase/server";

import { ensureCartIdentity, type CartIdentity } from "./identity";
import {
  fetchItemModifierLists,
  getCartSummary,
  getOrCreateDraftOrder,
  resolveModifierSelections,
  type CartSummary,
} from "./orders";
import {
  modifierSignature,
  type ModifierSelection,
} from "./modifier-signature";

/**
 * cart-v3 batch primitive: apply a payload of absolute-quantity cart
 * line targets to the customer's draft order in one transaction.
 *
 * Replaces the per-tap `setLineQuantityAction` ping-pong. The provider
 * accumulates rapid taps into a single batch keyed by `lineKey` and
 * fires this action once per debounce window.
 *
 * Two-stage execution:
 *
 *   1. Resolve + validate in JS. For each line we fetch its item +
 *      variation + modifier-list catalog rows in parallel, run them
 *      through `resolveModifierSelections` (the same validator
 *      addLineItem and setLineQuantity used before), compute the
 *      visible-modifier signature, and decide whether each line is
 *      an INSERT, UPDATE, or DELETE against the existing draft state.
 *      If ANY line fails validation the whole batch rejects — no
 *      partial cart writes.
 *
 *   2. Write in PL/pgSQL. `commerce.cart_apply_writes` takes the
 *      resolved INSERT / UPDATE / DELETE arrays and applies them
 *      inside a single Postgres transaction. The function runs with
 *      SECURITY INVOKER so RLS evaluates against the customer's
 *      auth.uid() — a forged order_id would fail the existing
 *      `order_line_items_write` policy on the first write and roll
 *      the whole transaction back.
 *
 * `written_by_client` is stamped on every write so the cart provider's
 * Realtime subscription can deterministically skip events that
 * originated from this tab (otherwise the round trip causes a spurious
 * refresh that competes with the optimistic state).
 */

export type UpsertCartLinesInput = {
  orgId: string;
  venueId: string;
  /** A stable per-tab UUID generated once at CartProvider mount.
   *  Used solely for Realtime self-event filtering — every write
   *  stamps `written_by_client = clientId` so subscribers can ignore
   *  their own changes. */
  clientId: string;

  /**
   * Absolute target quantities for one or more cart lines, addressed
   * by their `(itemId, variationId, modifiers)` tuple. The client
   * is responsible for collapsing rapid taps on the SAME line to a
   * single entry — the server logs a warning on duplicates and
   * applies last-writer-wins (no error).
   *
   * `qty = 0` means "this line should not exist after the batch
   * lands." `qty > 0` upserts.
   */
  lines: ReadonlyArray<{
    itemId: string;
    variationId: string;
    qty: number;
    modifiers: ReadonlyArray<{
      modifierListId: string;
      modifierId: string | null;
      quantity: number;
      text_value: string | null;
    }>;
  }>;

  /** Performance hint — when the client already knows the draft
   *  orderId, we skip the draft lookup. */
  orderId?: string;
  identity?: CartIdentity;
};

export type UpsertCartLineError = {
  /** Index into the input `lines` array. */
  lineIndex: number;
  reason: string;
};

/**
 * Lightweight shape representing a server-resolved line ready to be
 * written. Built per-line during the validation pass and consumed by
 * the PL/pgSQL RPC.
 */
type ResolvedLine = {
  // From the input
  itemId: string;
  variationId: string;
  qty: number;
  // Resolved from catalog state
  itemName: string;
  variationName: string;
  perUnitCents: number;
  catalogVersion: number;
  signature: string;
  resolvedModifiers: Array<{
    catalog_modifier_id: string | null;
    catalog_modifier_list_id: string;
    catalog_version: number;
    name: string;
    base_price_cents_delta: number;
    quantity: number;
    ordinal: number;
    text_value: string | null;
  }>;
};

export async function upsertCartLines(
  input: UpsertCartLinesInput,
): Promise<CartSummary> {
  if (input.lines.length === 0) {
    // Caller fired a batch with no lines (drained mid-flight, or
    // race). Return the current state instead of touching the DB.
    return getCartSummary({
      orgId: input.orgId,
      venueId: input.venueId,
      identity: input.identity,
      orderId: input.orderId,
    });
  }

  // Coalesce client-side dups. Same (itemId, variationId, visible-mod
  // signature) entries collapse to the LAST one — the client should
  // never send duplicates, but be defensive.
  const seenByKey = new Map<string, (typeof input.lines)[number]>();
  for (const line of input.lines) {
    const sig = modifierSignature(
      line.modifiers.map<ModifierSelection>((m) => ({
        listId: m.modifierListId,
        modifierId: m.modifierId,
        quantity: m.quantity,
        text_value: m.text_value,
      })),
    );
    const key = `${line.itemId}::${line.variationId}::${sig}`;
    if (seenByKey.has(key)) {
      console.warn("[upsertCartLines] duplicate lineKey in batch", { key });
    }
    seenByKey.set(key, line);
  }
  const dedupedLines = [...seenByKey.values()];

  const supabase = await createClient();

  // Resolve identity + draft order. Reuses the existing helpers; same
  // contract as setLineQuantity / the deleted addLineItem path.
  const draft = await getOrCreateDraftOrder({
    orgId: input.orgId,
    venueId: input.venueId,
    identity: input.identity,
  });
  const orderId = draft.orderId;

  // Parallelize catalog reads across all unique items in the batch.
  // For a 50-line batch on 5 distinct items this is 5 IML fetches +
  // 50 variation lookups in parallel.
  const uniqueItemIds = Array.from(new Set(dedupedLines.map((l) => l.itemId)));

  const [itemRows, variationRows, imlByItem] = await Promise.all([
    supabase
      .from("items")
      .select("id, name")
      .in("id", uniqueItemIds),
    supabase
      .from("item_variations")
      .select("id, item_id, name, price_cents, version")
      .in("item_id", uniqueItemIds)
      .eq("is_active", true),
    Promise.all(
      uniqueItemIds.map(async (id) => ({
        itemId: id,
        imls: await fetchItemModifierLists(supabase, id),
      })),
    ),
  ]);

  if (itemRows.error) throw new Error(itemRows.error.message);
  if (variationRows.error) throw new Error(variationRows.error.message);

  const itemById = new Map<string, { id: string; name: string }>();
  for (const row of itemRows.data ?? []) itemById.set(row.id, row);

  type VariationRow = {
    id: string;
    item_id: string;
    name: string;
    price_cents: number;
    version: number;
  };
  const variationsByItemId = new Map<string, VariationRow[]>();
  for (const row of variationRows.data ?? []) {
    const bucket = variationsByItemId.get(row.item_id) ?? [];
    bucket.push(row as VariationRow);
    variationsByItemId.set(row.item_id, bucket);
  }

  const imlByItemId = new Map<string, Awaited<ReturnType<typeof fetchItemModifierLists>>>();
  for (const { itemId, imls } of imlByItem) imlByItemId.set(itemId, imls);

  // Resolve every line into the shape the RPC expects. Throw on the
  // FIRST validation failure — the client surfaces a toast and refreshes.
  // Partial-batch writes are explicitly forbidden.
  const resolved: ResolvedLine[] = [];
  for (let i = 0; i < dedupedLines.length; i++) {
    const line = dedupedLines[i];

    const item = itemById.get(line.itemId);
    if (!item) {
      const err = new Error("Item not found.") as Error & {
        lineIndex?: number;
        reason?: string;
      };
      err.lineIndex = i;
      err.reason = "item_not_found";
      throw err;
    }

    const variation = (variationsByItemId.get(line.itemId) ?? []).find(
      (v) => v.id === line.variationId,
    );
    if (!variation) {
      const err = new Error("Item variation not found.") as Error & {
        lineIndex?: number;
        reason?: string;
      };
      err.lineIndex = i;
      err.reason = "variation_not_found";
      throw err;
    }

    const imls = imlByItemId.get(line.itemId) ?? [];

    // Reuse the existing modifier validator. Throws on missing
    // required mods, exceeding max selections, etc. The client doesn't
    // need a granular error code per failure mode — surfacing the
    // message is enough.
    const clientSelections: ModifierSelection[] = line.modifiers.map((m) => ({
      listId: m.modifierListId,
      modifierId: m.modifierId,
      quantity: m.quantity,
      text_value: m.text_value,
    }));
    let resolvedModifiers;
    try {
      resolvedModifiers = resolveModifierSelections(imls, clientSelections);
    } catch (cause) {
      const err = new Error(
        cause instanceof Error ? cause.message : "Modifier validation failed.",
      ) as Error & { lineIndex?: number; reason?: string };
      err.lineIndex = i;
      err.reason = "modifier_invalid";
      throw err;
    }

    const hiddenListIds = new Set(
      imls
        .filter((iml) => iml.hidden_from_customer_override)
        .map((iml) => iml.modifier_lists.id),
    );
    const visibleSelections: ModifierSelection[] = resolvedModifiers
      .filter((m) => !hiddenListIds.has(m.catalog_modifier_list_id))
      .map((m) => ({
        listId: m.catalog_modifier_list_id,
        modifierId: m.catalog_modifier_id,
        quantity: m.quantity,
        text_value: m.text_value,
      }));
    const signature = modifierSignature(visibleSelections);

    const modifierDeltaSum = resolvedModifiers.reduce(
      (sum, m) => sum + m.base_price_cents_delta * m.quantity,
      0,
    );
    const perUnitCents = variation.price_cents + modifierDeltaSum;

    resolved.push({
      itemId: item.id,
      variationId: variation.id,
      qty: Math.max(0, Math.floor(line.qty)),
      itemName: item.name,
      variationName: variation.name,
      perUnitCents,
      catalogVersion: variation.version,
      signature,
      resolvedModifiers,
    });
  }

  // Read existing line state for every (item, variation) pair the
  // batch touches. One round trip via .in() filters. We narrow to
  // the matching signature in JS.
  const itemIdsTouched = Array.from(new Set(resolved.map((l) => l.itemId)));
  const variationIdsTouched = Array.from(
    new Set(resolved.map((l) => l.variationId)),
  );

  const { data: candidateLines, error: candidatesError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select(
      "id, catalog_item_id, catalog_variation_id, quantity, base_price_cents, modifiers:order_line_item_modifiers(catalog_modifier_id, catalog_modifier_list_id, quantity, text_value)",
    )
    .eq("order_id", orderId)
    .in("catalog_item_id", itemIdsTouched)
    .in("catalog_variation_id", variationIdsTouched);
  if (candidatesError) throw new Error(candidatesError.message);

  // For each resolved line, find the matching existing row (by tuple
  // + signature). Decide insert / update / delete.
  type Insert = {
    uid: string;
    catalog_item_id: string;
    catalog_variation_id: string;
    catalog_version: number;
    name: string;
    variation_name: string;
    quantity: number;
    base_price_cents: number;
    total_price_cents: number;
    modifiers: ResolvedLine["resolvedModifiers"];
  };
  type Update = { id: string; quantity: number; total_price_cents: number };

  const inserts: Insert[] = [];
  const updates: Update[] = [];
  const deletes: string[] = [];

  for (const line of resolved) {
    const match = (candidateLines ?? []).find((row) => {
      if (row.catalog_item_id !== line.itemId) return false;
      if (row.catalog_variation_id !== line.variationId) return false;
      // Compute the row's visible-only signature to compare against
      // the resolved line's signature.
      const rowSelections: ModifierSelection[] = (row.modifiers ?? [])
        .filter((m) => m.catalog_modifier_list_id !== null)
        .map((m) => ({
          listId: m.catalog_modifier_list_id as string,
          modifierId: m.catalog_modifier_id,
          quantity: Number(m.quantity),
          text_value: m.text_value,
        }));
      // Re-resolve to drop hidden-only rows. We do this in JS rather
      // than pushing the filter into the SELECT because the IML
      // visibility data isn't on order_line_items.
      const imls = imlByItemId.get(line.itemId) ?? [];
      const hiddenListIds = new Set(
        imls
          .filter((iml) => iml.hidden_from_customer_override)
          .map((iml) => iml.modifier_lists.id),
      );
      const rowSigSelections = rowSelections.filter(
        (m) => !hiddenListIds.has(m.listId),
      );
      return modifierSignature(rowSigSelections) === line.signature;
    });

    if (line.qty <= 0) {
      if (match) deletes.push(match.id);
      // qty=0 with no match → no-op
      continue;
    }

    if (match) {
      const targetTotal = line.perUnitCents * line.qty;
      if (Number(match.quantity) === line.qty && match.base_price_cents === line.perUnitCents) {
        // Already at target — skip the UPDATE. Common after a
        // duplicate batch retry where the first attempt landed.
        continue;
      }
      updates.push({
        id: match.id,
        quantity: line.qty,
        total_price_cents: targetTotal,
      });
      continue;
    }

    // No match → INSERT. uid is required by the schema; the
    // line_item_child_sync_ids trigger will fill order_id/org_id on
    // modifier rows from the parent line, but the RPC passes them
    // explicitly anyway for clarity.
    const uid = crypto.randomUUID();
    inserts.push({
      uid,
      catalog_item_id: line.itemId,
      catalog_variation_id: line.variationId,
      catalog_version: line.catalogVersion,
      name: line.itemName,
      variation_name: line.variationName,
      quantity: line.qty,
      base_price_cents: line.perUnitCents,
      total_price_cents: line.perUnitCents * line.qty,
      modifiers: line.resolvedModifiers,
    });
  }

  // Fast path: every line in the batch was already at target. No
  // writes needed; just return the current cart.
  if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
    return getCartSummary({
      orgId: input.orgId,
      venueId: input.venueId,
      identity: input.identity,
      orderId,
    });
  }

  // Single atomic RPC call. The whole transaction commits or rolls
  // back together — partial writes are impossible by construction.
  const { error: rpcError } = await supabase.schema("commerce").rpc(
    "cart_apply_writes",
    {
      p_order_id: orderId,
      p_org_id: input.orgId,
      p_client_id: input.clientId,
      p_inserts: inserts as unknown as Parameters<
        typeof supabase.schema<"commerce">
      >[0] extends infer _ ? unknown : never,
      p_updates: updates as unknown as Parameters<
        typeof supabase.schema<"commerce">
      >[0] extends infer _ ? unknown : never,
      p_deletes: deletes,
    } as never,
  );
  if (rpcError) throw new Error(rpcError.message);

  return getCartSummary({
    orgId: input.orgId,
    venueId: input.venueId,
    identity: input.identity,
    orderId,
  });
}
