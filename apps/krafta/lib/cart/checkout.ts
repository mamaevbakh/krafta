import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ensureCartIdentity } from "./identity";

export type DineInFields = {
  tableLabel: string;
};

export type PickupFields = {
  scheduleType: "asap" | "scheduled";
  pickupAt: string | null;          // ISO timestamp; required when scheduled
  recipientName: string | null;
  recipientPhone: string | null;
  note: string | null;
};

export type DeliveryFields = {
  address: string;                  // free-text for v1; structured later
  recipientName: string;
  recipientPhone: string;
  scheduledFor: string | null;      // ISO timestamp; null = ASAP
  note: string | null;
};

export type PlaceOrderInput =
  | { orgId: string; venueId: string; mode: "dine_in"; fields: DineInFields }
  | { orgId: string; venueId: string; mode: "pickup"; fields: PickupFields }
  | { orgId: string; venueId: string; mode: "delivery"; fields: DeliveryFields };

export type PlaceOrderResult = {
  orderId: string;
  state: "open";
};

/**
 * Transitions the customer's draft order to state='open' and creates the
 * mode-specific fulfillment row. Idempotent on retries: if the order is
 * already open we simply return its id.
 *
 * For dine-in, also opens (or joins) a table_session for (venue, label) and
 * creates the customer's guest_session, attaching both to the order.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const supabase = await createClient();
  const { customerId, userId } = await ensureCartIdentity(input.orgId);

  // Pull the customer's current draft order. If none exists, the caller
  // tried to checkout an empty cart.
  const { data: order, error: orderError } = await supabase
    .schema("commerce")
    .from("orders")
    .select("id, state, version")
    .eq("customer_id", customerId)
    .eq("venue_id", input.venueId)
    .eq("state", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("No draft order to place. Add items first.");

  const { data: lines, error: linesError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select("id")
    .eq("order_id", order.id)
    .limit(1);
  if (linesError) throw new Error(linesError.message);
  if (!lines || lines.length === 0) {
    throw new Error("Cart is empty.");
  }

  // ---- Mode-specific prep -------------------------------------------------

  let tableSessionId: string | null = null;
  let guestSessionId: string | null = null;

  if (input.mode === "dine_in") {
    const tableLabel = input.fields.tableLabel.trim();
    if (!tableLabel) throw new Error("Table number is required for dine-in.");

    // Find or open a table_session. The partial unique index
    // (venue_id, table_label) WHERE status='open' guarantees at most one open
    // session per table, so the SELECT-then-INSERT race is acceptable: at
    // worst, the INSERT loses to the unique violation and we re-select.
    const { data: existingSession, error: sessionError } = await supabase
      .schema("commerce")
      .from("table_sessions")
      .select("id")
      .eq("venue_id", input.venueId)
      .eq("table_label", tableLabel)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);

    if (existingSession?.id) {
      tableSessionId = existingSession.id;
    } else {
      const { data: createdSession, error: createSessionError } = await supabase
        .schema("commerce")
        .from("table_sessions")
        .insert({
          // org_id is set by the table_sessions_sync_org_id trigger.
          org_id: input.orgId,
          venue_id: input.venueId,
          table_label: tableLabel,
          status: "open",
        })
        .select("id")
        .single();
      if (createSessionError) throw new Error(createSessionError.message);
      tableSessionId = createdSession.id;
    }

    const { data: guestSession, error: guestError } = await supabase
      .schema("commerce")
      .from("guest_sessions")
      .insert({
        // org_id is set by the guest_sessions_sync_org_id trigger.
        org_id: input.orgId,
        table_session_id: tableSessionId,
        customer_id: customerId,
        user_id: userId,
      })
      .select("id")
      .single();
    if (guestError) throw new Error(guestError.message);
    guestSessionId = guestSession.id;
  }

  // ---- Transition draft → open -------------------------------------------

  const orderUpdate: Record<string, unknown> = {
    state: "open",
    table_session_id: tableSessionId,
    guest_session_id: guestSessionId,
  };

  const { error: updateError } = await supabase
    .schema("commerce")
    .from("orders")
    .update(orderUpdate)
    .eq("id", order.id)
    .eq("version", order.version); // OCC

  if (updateError) throw new Error(updateError.message);

  // ---- Fulfillment + mode-specific details -------------------------------

  const fulfillmentUid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const { data: fulfillment, error: fulfillmentError } = await supabase
    .schema("commerce")
    .from("fulfillments")
    .insert({
      // org_id auto-set by order_child_sync_org_id trigger.
      org_id: input.orgId,
      uid: fulfillmentUid,
      order_id: order.id,
      type: input.mode,
      state: "proposed",
      line_item_application: "all",
    })
    .select("id")
    .single();
  if (fulfillmentError) throw new Error(fulfillmentError.message);

  if (input.mode === "dine_in") {
    if (!tableSessionId || !guestSessionId) {
      throw new Error("Dine-in fulfillment requires table + guest sessions.");
    }
    const { error } = await supabase
      .schema("commerce")
      .from("fulfillment_dine_in_details")
      .insert({
        fulfillment_id: fulfillment.id,
        table_session_id: tableSessionId,
        table_label: input.fields.tableLabel.trim(),
        guest_session_id: guestSessionId,
      });
    if (error) throw new Error(error.message);
  } else if (input.mode === "pickup") {
    const { scheduleType, pickupAt, recipientName, recipientPhone, note } =
      input.fields;
    if (scheduleType === "scheduled" && !pickupAt) {
      throw new Error("Scheduled pickup requires a pickup time.");
    }
    const { error } = await supabase
      .schema("commerce")
      .from("fulfillment_pickup_details")
      .insert({
        fulfillment_id: fulfillment.id,
        schedule_type: scheduleType,
        pickup_at: scheduleType === "scheduled" ? pickupAt : null,
        recipient_name: recipientName?.trim() || null,
        recipient_phone: recipientPhone?.trim() || null,
        note: note?.trim() || null,
        placed_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  } else {
    // delivery
    const { address, recipientName, recipientPhone, scheduledFor, note } =
      input.fields;
    if (!address.trim()) throw new Error("Delivery address is required.");
    if (!recipientName.trim()) throw new Error("Recipient name is required.");
    if (!recipientPhone.trim()) throw new Error("Recipient phone is required.");

    const { error } = await supabase
      .schema("commerce")
      .from("fulfillment_delivery_details")
      .insert({
        fulfillment_id: fulfillment.id,
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim(),
        address: { freeform: address.trim() },
        scheduled_for: scheduledFor,
        delivery_provider: "merchant",
        note: note?.trim() || null,
        placed_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  return { orderId: order.id, state: "open" };
}
