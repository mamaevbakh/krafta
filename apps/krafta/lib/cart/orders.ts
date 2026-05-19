import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ensureCartIdentity } from "./identity";
import { modifierSignature, type ModifierSelection } from "./modifier-signature";

export type CartLineItemModifier = {
  id: string;
  catalog_modifier_id: string | null;
  name: string;
  base_price_cents_delta: number;
  quantity: number;
};

export type CartLineItem = {
  id: string;
  uid: string;
  catalog_item_id: string | null;
  catalog_variation_id: string | null;
  name: string;
  variation_name: string | null;
  quantity: number;
  base_price_cents: number;
  total_price_cents: number;
  modifiers: CartLineItemModifier[];
};

export type CartSummary = {
  orderId: string | null;
  version: number;
  lineItems: CartLineItem[];
  subtotalCents: number;
};

type GetOrCreateDraftInput = {
  orgId: string;
  venueId: string;
  source?: "web" | "tma" | "qr_scan" | "dashboard";
};

/**
 * Returns the customer's existing draft order for the venue, or creates one.
 *
 * Cart-as-draft pattern (ADR 0001 §7 Q6): the cart is just an `orders` row in
 * state='draft' owned by the customer's anon Supabase session. One draft per
 * (customer, venue) is the convention; not enforced at the DB level.
 */
export async function getOrCreateDraftOrder(
  input: GetOrCreateDraftInput,
): Promise<{ orderId: string; version: number; customerId: string }> {
  const supabase = await createClient();
  const { customerId } = await ensureCartIdentity(input.orgId);

  const { data: existing, error: selectError } = await supabase
    .schema("commerce")
    .from("orders")
    .select("id, version")
    .eq("customer_id", customerId)
    .eq("venue_id", input.venueId)
    .eq("state", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);
  if (existing) {
    return {
      orderId: existing.id,
      version: existing.version,
      customerId,
    };
  }

  // orders.catalog_id is NOT NULL but the BEFORE-INSERT trigger
  // `orders_sync_from_venue` overwrites it from the venue. We pass the org_id
  // we know and a placeholder catalog_id; the trigger sets both correctly.
  const { data: created, error: insertError } = await supabase
    .schema("commerce")
    .from("orders")
    .insert({
      org_id: input.orgId,
      catalog_id: input.orgId,
      venue_id: input.venueId,
      customer_id: customerId,
      state: "draft",
      source: input.source ?? "web",
    })
    .select("id, version")
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Failed to create draft order.");
  }

  return { orderId: created.id, version: created.version, customerId };
}

type AddLineItemInput = {
  orgId: string;
  venueId: string;
  itemId: string;
  variationId?: string;
  quantity?: number;
  modifiers?: ModifierSelection[];
};

// Resolved snapshot of a modifier ready to be written to
// commerce.order_line_item_modifiers. Built from the catalog's modifier rows
// (server queries them fresh) so the snapshot can't be forged client-side.
type ResolvedModifier = {
  catalog_modifier_id: string;
  catalog_version: number;
  name: string;
  base_price_cents_delta: number;
  quantity: number;
  ordinal: number;
};

/**
 * Adds an item to the customer's draft cart. Snapshots the catalog item +
 * variation onto the line so future catalog edits do not retroactively
 * change historical orders (ADR 0001 §3 snapshot principle).
 *
 * If `variationId` is omitted, uses the item's default variation.
 *
 * Modifier handling (KRA-62):
 *   - Server fetches the item's modifier_lists fresh and validates that every
 *     selected modifier_id belongs to a list attached to the item, with
 *     min/max bounds respected (override → list default).
 *   - Hidden-from-customer lists never appear in the picker; the server still
 *     auto-applies their `on_by_default=true` modifiers at add time (Square
 *     parity / KRA-62 D2). The customer cannot override these.
 *   - Dedup: two add-to-cart actions merge into one row iff
 *     (item, variation, modifier_signature) matches. The signature is
 *     computed by the shared modifierSignature() util so client local state
 *     and server agree byte-for-byte.
 */
export async function addLineItem(
  input: AddLineItemInput,
): Promise<{ orderId: string; lineItemId: string }> {
  const supabase = await createClient();
  const { orderId } = await getOrCreateDraftOrder({
    orgId: input.orgId,
    venueId: input.venueId,
  });

  const quantity = input.quantity ?? 1;
  if (quantity <= 0) throw new Error("quantity must be > 0");

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id, name")
    .eq("id", input.itemId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error("Item not found.");

  const variationQuery = supabase
    .from("item_variations")
    .select("id, name, price_cents, version")
    .eq("item_id", input.itemId)
    .eq("is_active", true);

  const { data: variation, error: variationError } = input.variationId
    ? await variationQuery.eq("id", input.variationId).maybeSingle()
    : await variationQuery.eq("is_default", true).maybeSingle();

  if (variationError) throw new Error(variationError.message);
  if (!variation) throw new Error("Item variation not found.");

  const resolvedModifiers = await resolveModifierSelections(
    supabase,
    input.itemId,
    input.modifiers ?? [],
  );

  const modifierSelections: ModifierSelection[] = resolvedModifiers.map((m) => ({
    modifierId: m.catalog_modifier_id,
    quantity: m.quantity,
  }));
  const signature = modifierSignature(modifierSelections);
  const modifierDeltaSum = resolvedModifiers.reduce(
    (sum, m) => sum + m.base_price_cents_delta * m.quantity,
    0,
  );
  const perUnitCents = variation.price_cents + modifierDeltaSum;

  // Look for an existing line we can merge into. Same (item, variation) is
  // a necessary condition but not sufficient — modifier signatures must also
  // match. Fetch all candidates + their modifier rows in two queries, then
  // compare signatures in memory.
  const { data: candidateLines, error: candidatesError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select("id, quantity, base_price_cents")
    .eq("order_id", orderId)
    .eq("catalog_item_id", input.itemId)
    .eq("catalog_variation_id", variation.id);
  if (candidatesError) throw new Error(candidatesError.message);

  if (candidateLines && candidateLines.length > 0) {
    const candidateIds = candidateLines.map((row) => row.id);
    const { data: candidateMods, error: candidateModsError } = await supabase
      .schema("commerce")
      .from("order_line_item_modifiers")
      .select("line_item_id, catalog_modifier_id, quantity")
      .in("line_item_id", candidateIds);
    if (candidateModsError) throw new Error(candidateModsError.message);

    const modsByLineId = new Map<
      string,
      Array<{ modifierId: string; quantity: number }>
    >();
    for (const row of candidateMods ?? []) {
      if (!row.catalog_modifier_id) continue;
      const list = modsByLineId.get(row.line_item_id) ?? [];
      list.push({
        modifierId: row.catalog_modifier_id,
        quantity: Number(row.quantity),
      });
      modsByLineId.set(row.line_item_id, list);
    }

    const match = candidateLines.find((line) => {
      const lineSelections = modsByLineId.get(line.id) ?? [];
      return modifierSignature(lineSelections) === signature;
    });

    if (match) {
      const nextQty = Number(match.quantity) + quantity;
      const { error: updateError } = await supabase
        .schema("commerce")
        .from("order_line_items")
        .update({
          quantity: nextQty,
          total_price_cents: perUnitCents * nextQty,
        })
        .eq("id", match.id);
      if (updateError) throw new Error(updateError.message);
      return { orderId, lineItemId: match.id };
    }
  }

  const uid = crypto.randomUUID();
  const totalCents = perUnitCents * quantity;

  // org_id is auto-set by the order_line_items_sync_org_id trigger; we pass
  // any uuid to satisfy the NOT NULL Insert type.
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
      quantity,
      base_price_cents: variation.price_cents,
      total_price_cents: totalCents,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Failed to add line item.");
  }

  if (resolvedModifiers.length > 0) {
    const modifierRows = resolvedModifiers.map((mod, index) => ({
      // line_item_child_sync_ids trigger fills order_id + org_id from the
      // parent line, so any uuid placeholder satisfies the NOT NULL Insert
      // type.
      order_id: orderId,
      org_id: orderId,
      line_item_id: created.id,
      uid: `${uid}-${index}`,
      catalog_modifier_id: mod.catalog_modifier_id,
      catalog_version: mod.catalog_version,
      name: mod.name,
      base_price_cents_delta: mod.base_price_cents_delta,
      quantity: mod.quantity,
      ordinal: mod.ordinal,
    }));
    const { error: modInsertError } = await supabase
      .schema("commerce")
      .from("order_line_item_modifiers")
      .insert(modifierRows);
    if (modInsertError) {
      // Best-effort rollback: remove the just-inserted line so the cart does
      // not end up with a line missing its modifiers.
      await supabase
        .schema("commerce")
        .from("order_line_items")
        .delete()
        .eq("id", created.id);
      throw new Error(modInsertError.message);
    }
  }

  return { orderId, lineItemId: created.id };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Validates the customer's modifier picks against the item's modifier_lists
// (with overrides), and expands hidden-from-customer lists with their
// on_by_default modifiers (the customer never sees those, but the kitchen
// must — Square parity).
async function resolveModifierSelections(
  supabase: SupabaseClient,
  itemId: string,
  selections: ModifierSelection[],
): Promise<ResolvedModifier[]> {
  const { data: imlRows, error } = await supabase
    .from("item_modifier_lists")
    .select(
      "modifier_list_id, min_selected_override, max_selected_override, hidden_from_customer_override, modifier_lists!inner(id, min_selected, max_selected, is_active, modifiers(id, name, price_cents, ordinal, on_by_default, is_active, version))",
    )
    .eq("item_id", itemId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  type IMLRow = {
    modifier_list_id: string;
    min_selected_override: number | null;
    max_selected_override: number | null;
    hidden_from_customer_override: boolean;
    modifier_lists: {
      id: string;
      min_selected: number;
      max_selected: number | null;
      is_active: boolean;
      modifiers: Array<{
        id: string;
        name: string;
        price_cents: number;
        ordinal: number;
        on_by_default: boolean;
        is_active: boolean;
        version: number;
      }>;
    };
  };
  const imls = (imlRows ?? []) as unknown as IMLRow[];

  const modifierLookup = new Map<
    string,
    { listId: string; mod: IMLRow["modifier_lists"]["modifiers"][number] }
  >();
  for (const iml of imls) {
    if (!iml.modifier_lists.is_active) continue;
    for (const mod of iml.modifier_lists.modifiers) {
      if (!mod.is_active) continue;
      modifierLookup.set(mod.id, { listId: iml.modifier_lists.id, mod });
    }
  }

  // Group user selections by list and validate per-list bounds against
  // hidden lists separately — the customer cannot supply selections for a
  // hidden list, so any such input is rejected as tampering.
  const selectionsByList = new Map<string, ModifierSelection[]>();
  for (const sel of selections) {
    if (sel.quantity <= 0) continue;
    const entry = modifierLookup.get(sel.modifierId);
    if (!entry) {
      throw new Error("Selected modifier is not available for this item.");
    }
    const iml = imls.find((row) => row.modifier_list_id === entry.listId);
    if (!iml) {
      throw new Error("Selected modifier is not available for this item.");
    }
    if (iml.hidden_from_customer_override) {
      throw new Error("Selected modifier is not available for this item.");
    }
    const list = selectionsByList.get(entry.listId) ?? [];
    list.push(sel);
    selectionsByList.set(entry.listId, list);
  }

  // Enforce min/max on customer-visible lists.
  for (const iml of imls) {
    if (iml.hidden_from_customer_override) continue;
    const list = iml.modifier_lists;
    const minSelected = iml.min_selected_override ?? list.min_selected;
    const maxSelected = iml.max_selected_override ?? list.max_selected;
    const sels = selectionsByList.get(list.id) ?? [];
    const count = sels.reduce((sum, s) => sum + s.quantity, 0);
    if (count < minSelected) {
      throw new Error("Please make the required modifier selections.");
    }
    if (maxSelected !== null && count > maxSelected) {
      throw new Error("Too many modifiers selected.");
    }
  }

  // Assemble the resolved set: customer picks + auto-applied defaults from
  // hidden lists. The customer cannot touch the hidden lists, so any conflict
  // is impossible by construction.
  const resolved: ResolvedModifier[] = [];
  for (const sel of selections) {
    if (sel.quantity <= 0) continue;
    const entry = modifierLookup.get(sel.modifierId);
    if (!entry) continue;
    resolved.push({
      catalog_modifier_id: entry.mod.id,
      catalog_version: entry.mod.version,
      name: entry.mod.name,
      base_price_cents_delta: entry.mod.price_cents,
      quantity: sel.quantity,
      ordinal: entry.mod.ordinal,
    });
  }
  for (const iml of imls) {
    if (!iml.hidden_from_customer_override) continue;
    if (!iml.modifier_lists.is_active) continue;
    for (const mod of iml.modifier_lists.modifiers) {
      if (!mod.is_active || !mod.on_by_default) continue;
      resolved.push({
        catalog_modifier_id: mod.id,
        catalog_version: mod.version,
        name: mod.name,
        base_price_cents_delta: mod.price_cents,
        quantity: 1,
        ordinal: mod.ordinal,
      });
    }
  }

  return resolved;
}

export async function updateLineItemQuantity(
  lineItemId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) {
    await removeLineItem(lineItemId);
    return;
  }
  const supabase = await createClient();
  const { data: line, error: selectError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select("base_price_cents")
    .eq("id", lineItemId)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);
  if (!line) throw new Error("Line item not found.");

  const { error: updateError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .update({
      quantity,
      total_price_cents: line.base_price_cents * quantity,
    })
    .eq("id", lineItemId);
  if (updateError) throw new Error(updateError.message);
}

export async function removeLineItem(lineItemId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .delete()
    .eq("id", lineItemId);
  if (error) throw new Error(error.message);
}

export async function clearCart(orderId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .delete()
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
}

/**
 * Reads the cart for the current customer at the given venue. Returns null-ish
 * shape (no order, empty lines) when the customer has no draft yet so
 * components can render "empty cart" without conditional walls of code.
 */
export async function getCartSummary(input: {
  orgId: string;
  venueId: string;
}): Promise<CartSummary> {
  const supabase = await createClient();
  const { customerId } = await ensureCartIdentity(input.orgId);

  const { data: order, error: orderError } = await supabase
    .schema("commerce")
    .from("orders")
    .select("id, version")
    .eq("customer_id", customerId)
    .eq("venue_id", input.venueId)
    .eq("state", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) {
    return { orderId: null, version: 0, lineItems: [], subtotalCents: 0 };
  }

  const { data: lines, error: linesError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select(
      "id, uid, catalog_item_id, catalog_variation_id, name, variation_name, quantity, base_price_cents, total_price_cents",
    )
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  if (linesError) throw new Error(linesError.message);

  const lineIds = (lines ?? []).map((row) => row.id);
  let modifiersByLineId = new Map<string, CartLineItemModifier[]>();
  if (lineIds.length > 0) {
    const { data: modRows, error: modError } = await supabase
      .schema("commerce")
      .from("order_line_item_modifiers")
      .select(
        "id, line_item_id, catalog_modifier_id, name, base_price_cents_delta, quantity, ordinal",
      )
      .in("line_item_id", lineIds)
      .order("ordinal", { ascending: true });
    if (modError) throw new Error(modError.message);
    modifiersByLineId = (modRows ?? []).reduce((acc, row) => {
      const list = acc.get(row.line_item_id) ?? [];
      list.push({
        id: row.id,
        catalog_modifier_id: row.catalog_modifier_id,
        name: row.name,
        base_price_cents_delta: row.base_price_cents_delta,
        quantity: Number(row.quantity),
      });
      acc.set(row.line_item_id, list);
      return acc;
    }, new Map<string, CartLineItemModifier[]>());
  }

  const lineItems = (lines ?? []).map((row) => ({
    id: row.id,
    uid: row.uid,
    catalog_item_id: row.catalog_item_id,
    catalog_variation_id: row.catalog_variation_id,
    name: row.name,
    variation_name: row.variation_name,
    quantity: Number(row.quantity),
    base_price_cents: row.base_price_cents,
    total_price_cents: row.total_price_cents,
    modifiers: modifiersByLineId.get(row.id) ?? [],
  }));

  const subtotalCents = lineItems.reduce(
    (sum, line) => sum + line.total_price_cents,
    0,
  );

  return {
    orderId: order.id,
    version: order.version,
    lineItems,
    subtotalCents,
  };
}
