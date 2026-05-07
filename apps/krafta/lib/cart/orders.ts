import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ensureCartIdentity } from "./identity";

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
};

/**
 * Adds an item to the customer's draft cart. Snapshots the catalog item +
 * variation onto the line so future catalog edits do not retroactively
 * change historical orders (ADR 0001 §3 snapshot principle).
 *
 * If `variationId` is omitted, uses the item's default variation.
 * If a line item for the same (item, variation) already exists on the
 * draft, increments its quantity instead of adding a duplicate row.
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

  // Merge into an existing line for the same (item, variation) if present.
  const { data: existingLine } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select("id, quantity")
    .eq("order_id", orderId)
    .eq("catalog_item_id", input.itemId)
    .eq("catalog_variation_id", variation.id)
    .maybeSingle();

  if (existingLine) {
    const nextQty = Number(existingLine.quantity) + quantity;
    const { error: updateError } = await supabase
      .schema("commerce")
      .from("order_line_items")
      .update({
        quantity: nextQty,
        total_price_cents: variation.price_cents * nextQty,
      })
      .eq("id", existingLine.id);
    if (updateError) throw new Error(updateError.message);
    return { orderId, lineItemId: existingLine.id };
  }

  const uid = crypto.randomUUID();
  const totalCents = variation.price_cents * quantity;

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

  return { orderId, lineItemId: created.id };
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
