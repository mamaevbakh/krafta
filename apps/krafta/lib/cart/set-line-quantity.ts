import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  fetchItemModifierLists,
  getOrCreateDraftOrder,
  getCartSummary,
  resolveModifierSelections,
  type CartSummary,
} from "./orders";
import type { CartIdentity } from "./identity";
import {
  modifierSignature,
  type ModifierSelection,
} from "./modifier-signature";

/**
 * cart-v3 server primitive: set the absolute quantity of a single cart
 * line, addressed by its tuple (itemId, variationId, modifierSig).
 *
 * Replaces the three cart-v2 actions (add / update / remove) with one
 * verb. Semantics:
 *
 *   qty > 0, line exists    → UPDATE quantity + total_price_cents
 *   qty > 0, line missing   → INSERT line + modifier rows (requires
 *                              `entryShape` for variation + modifier
 *                              metadata the server can't reconstruct
 *                              from lineKey alone)
 *   qty <= 0, line exists   → DELETE the line
 *   qty <= 0, line missing  → no-op (the customer's intent is already
 *                              satisfied)
 *
 * Why absolute quantity instead of delta:
 *
 *   - Rapid taps + serialize lock + absolute qty = final state is always
 *     the last-dispatched value. With delta the same flow needs the
 *     server to maintain a running counter; with absolute the client's
 *     optimistic state is authoritative for the target and the server
 *     just walks toward it.
 *
 *   - Idempotency keys are simpler: same (key, qty) twice is naturally
 *     a no-op the second time because the SET is already in place. Old
 *     +1 semantics needed the cache layer to do real work; here the
 *     cache layer is belt-and-braces.
 *
 *   - Out-of-order arrival becomes a non-issue: setQty(2) arriving
 *     after setQty(3) lands at qty=2 (last writer wins), which is the
 *     wrong final state for "I tapped + + +" but the right one for
 *     "I tapped + + −". The serialize lock pins the dispatch order so
 *     responses arrive in dispatch order — the lock + absolute qty
 *     combo gives us last-WRITER-by-dispatch-order, which is what the
 *     customer expects.
 *
 * Signature dedup uses VISIBLE modifiers only (`hiddenListIds` filter)
 * so client + server agree on the lookup key even when the item carries
 * hidden auto-applied mods (VAT, kitchen flags, etc).
 *
 * Returns the fresh CartSummary the caller should commit to optimistic
 * state.
 */

export type SetLineQuantityInput = {
  orgId: string;
  venueId: string;

  /**
   * Stable tuple key for the line, computed by lib/cart/line-key.ts.
   * Used by the client purely as an addressing token; the server
   * re-resolves the (item, variation, modifier) tuple from canonical
   * catalog state below and uses ITS resolved version for the actual
   * database lookup. The lineKey is therefore "intent" — the entry
   * the customer wants to mutate — and any drift from server-resolved
   * truth surfaces as a not-found path (effectively a no-op or, for
   * inserts, the line gets created with the server-resolved shape).
   */
  itemId: string;
  /**
   * Resolved variation. cart-v3 contract: the client always knows
   * which variation it's targeting — either because the customer
   * picked one explicitly, or because the catalog data carried a
   * `defaultVariationId` for items with no picker. Permissive
   * variation matching from cart-v2 is gone; the client and server
   * lineKeys converge by construction.
   */
  variationId: string;

  /**
   * Absolute target quantity. 0 (or negative) means "this line should
   * not exist after this call resolves". The reducer on the client
   * agrees: setQty(lineKey, 0) deletes the entry.
   */
  qty: number;

  /**
   * Modifier selections the customer picked. Required when inserting
   * (qty > 0 and no matching server line); used to compute the dedup
   * signature for the lookup. For updates/removes the client can omit
   * — we'll fetch the existing line's modifiers and use them.
   */
  modifiers?: ReadonlyArray<{
    modifierListId: string;
    modifierId: string | null;
    quantity: number;
    text_value: string | null;
  }>;

  identity?: CartIdentity;
  /** Performance hint — when the client already knows the draft orderId,
   *  we skip the draft lookup. */
  orderId?: string;
};

export async function setLineQuantity(
  input: SetLineQuantityInput,
): Promise<CartSummary> {
  const supabase = await createClient();
  const targetQty = Math.max(0, Math.floor(input.qty));

  // Parallel reads: draft order + item + variation + modifier lists.
  // 4 independent queries collapse to one ~200ms RT.
  const [draftResult, itemResult, variationResult, imlResult] =
    await Promise.all([
      getOrCreateDraftOrder({
        orgId: input.orgId,
        venueId: input.venueId,
        identity: input.identity,
      }),
      supabase
        .from("items")
        .select("id, name")
        .eq("id", input.itemId)
        .maybeSingle(),
      supabase
        .from("item_variations")
        .select("id, name, price_cents, version")
        .eq("item_id", input.itemId)
        .eq("id", input.variationId)
        .eq("is_active", true)
        .maybeSingle(),
      fetchItemModifierLists(supabase, input.itemId),
    ]);

  const { orderId } = draftResult;

  if (itemResult.error) throw new Error(itemResult.error.message);
  const item = itemResult.data;
  if (!item) throw new Error("Item not found.");

  if (variationResult.error) throw new Error(variationResult.error.message);
  const variation = variationResult.data;
  if (!variation) throw new Error("Item variation not found.");

  // Resolve modifier selections against canonical catalog state.
  // resolveModifierSelections enforces required / range constraints and
  // auto-applies the on_by_default rows of any list the customer didn't
  // touch.
  const clientSelections: ModifierSelection[] = (input.modifiers ?? []).map(
    (m) => ({
      listId: m.modifierListId,
      modifierId: m.modifierId,
      quantity: m.quantity,
      text_value: m.text_value,
    }),
  );
  const resolvedModifiers = resolveModifierSelections(
    imlResult,
    clientSelections,
  );

  // Hidden lists drop out of the dedup signature on both sides — see
  // `fetchHiddenModifierListsForItems` in orders.ts for the long-form
  // justification (kitchen-only / VAT / surcharge lists, etc).
  const hiddenListIds = new Set(
    imlResult
      .filter((iml) => iml.hidden_from_customer_override)
      .map((iml) => iml.modifier_lists.id),
  );

  // Server-authoritative signature, restricted to visible mods so it
  // matches what the client computes from its own selections.
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

  // Find any existing line for this (order, item, variation). We then
  // narrow to the modifier-signature match in JS — the same dedup
  // contract the client signature builder uses.
  const { data: candidateLines, error: candidatesError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select(
      "id, quantity, base_price_cents, modifiers:order_line_item_modifiers(catalog_modifier_id, catalog_modifier_list_id, quantity, text_value)",
    )
    .eq("order_id", orderId)
    .eq("catalog_item_id", input.itemId)
    .eq("catalog_variation_id", variation.id);
  if (candidatesError) throw new Error(candidatesError.message);

  const match = candidateLines?.find((line) => {
    const lineSelections: ModifierSelection[] = (line.modifiers ?? [])
      .filter((m) => m.catalog_modifier_list_id !== null)
      .filter(
        (m) => !hiddenListIds.has(m.catalog_modifier_list_id as string),
      )
      .map((m) => ({
        listId: m.catalog_modifier_list_id as string,
        modifierId: m.catalog_modifier_id,
        quantity: Number(m.quantity),
        text_value: m.text_value,
      }));
    return modifierSignature(lineSelections) === signature;
  });

  // ── DELETE: qty=0 on an existing line ─────────────────────────────────
  if (targetQty <= 0) {
    if (match) {
      const { error: deleteError } = await supabase
        .schema("commerce")
        .from("order_line_items")
        .delete()
        .eq("id", match.id);
      if (deleteError) throw new Error(deleteError.message);
    }
    // Fall through to getCartSummary so the response is consistent
    // whether or not the delete ran. The no-op path is the "customer
    // tapped trash on a line that's already gone in another tab" case.
    return getCartSummary({
      orgId: input.orgId,
      venueId: input.venueId,
      identity: input.identity,
      orderId,
    });
  }

  // ── UPDATE: existing line, set absolute qty ───────────────────────────
  if (match) {
    if (Number(match.quantity) !== targetQty) {
      const { error: updateError } = await supabase
        .schema("commerce")
        .from("order_line_items")
        .update({
          quantity: targetQty,
          total_price_cents: perUnitCents * targetQty,
        })
        .eq("id", match.id);
      if (updateError) throw new Error(updateError.message);
    }
    return getCartSummary({
      orgId: input.orgId,
      venueId: input.venueId,
      identity: input.identity,
      orderId,
    });
  }

  // ── INSERT: brand-new line ────────────────────────────────────────────
  const uid = crypto.randomUUID();
  const totalCents = perUnitCents * targetQty;

  // org_id is back-filled by the order_line_items_sync_org_id trigger;
  // we pass any uuid to satisfy the NOT NULL Insert type.
  const { data: created, error: insertError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .insert({
      order_id: orderId,
      org_id: orderId,
      uid,
      catalog_item_id: item.id,
      catalog_variation_id: variation.id,
      catalog_version: variation.version,
      name: item.name,
      variation_name: variation.name,
      quantity: targetQty,
      base_price_cents: variation.price_cents,
      total_price_cents: totalCents,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Failed to insert line item.");
  }

  if (resolvedModifiers.length > 0) {
    const modifierRows = resolvedModifiers.map((mod: (typeof resolvedModifiers)[number], index: number) => ({
      // line_item_child_sync_ids trigger fills order_id + org_id from the
      // parent line, so any uuid placeholder satisfies the NOT NULL Insert.
      order_id: orderId,
      org_id: orderId,
      line_item_id: created.id,
      uid: `${uid}-${index}`,
      catalog_modifier_id: mod.catalog_modifier_id,
      catalog_modifier_list_id: mod.catalog_modifier_list_id,
      catalog_version: mod.catalog_version,
      name: mod.name,
      base_price_cents_delta: mod.base_price_cents_delta,
      quantity: mod.quantity,
      ordinal: mod.ordinal,
      text_value: mod.text_value,
    }));
    const { error: modInsertError } = await supabase
      .schema("commerce")
      .from("order_line_item_modifiers")
      .insert(modifierRows);
    if (modInsertError) {
      // Best-effort rollback: drop the just-inserted line so the cart
      // doesn't end up with a line missing its modifiers.
      await supabase
        .schema("commerce")
        .from("order_line_items")
        .delete()
        .eq("id", created.id);
      throw new Error(modInsertError.message);
    }
  }

  return getCartSummary({
    orgId: input.orgId,
    venueId: input.venueId,
    identity: input.identity,
    orderId,
  });
}

