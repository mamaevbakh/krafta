import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ensureCartIdentity } from "./identity";
import { normalizeUzPhone } from "./phone";
import {
  computePricing,
  distributeProRata,
} from "./pricing";
import {
  isWithinDeliveryZone,
  normalizeDeliverySettings,
} from "@/lib/catalogs/settings/delivery";

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
  address: string;                  // freeform " · "-joined; shown on receipts
  latitude: number | null;          // picker coords — zone gate + courier dispatch
  longitude: number | null;
  district: string | null;
  street: string | null;
  building: string | null;
  recipientName: string;
  recipientPhone: string;
  scheduledFor: string | null;      // ISO timestamp; null = ASAP
  note: string | null;
};

// Tip is a customer-side choice captured at place-time and persisted on the
// payments row that's created in the same transaction (KRA-63 D2). 0 = no
// tip. Value is the absolute cents the customer agreed to (whatever the UI
// computed from percentage / fixed; server doesn't re-derive).
type CommonFields = { tipCents?: number };

export type PlaceOrderInput =
  | ({ orgId: string; venueId: string; mode: "dine_in"; fields: DineInFields } & CommonFields)
  | ({ orgId: string; venueId: string; mode: "pickup"; fields: PickupFields } & CommonFields)
  | ({ orgId: string; venueId: string; mode: "delivery"; fields: DeliveryFields } & CommonFields);

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

  // Preflight: the venue must be accepting orders AND the requested mode
  // must be enabled on it. The customer-side UI gates these via
  // CartProvider/mode-picker, but we re-check here because server actions
  // are reachable directly and the venue can be edited mid-session.
  // We also grab catalog_id + currency here because we'll need them when
  // writing order_taxes / order_payments below — saves a second roundtrip.
  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("status, modes_enabled, catalog_id, currency")
    .eq("id", input.venueId)
    .maybeSingle();
  if (venueError) throw new Error(venueError.message);
  if (!venue) throw new Error("Venue not found.");
  if (venue.status !== "active") {
    throw new Error("This venue is not accepting orders right now.");
  }
  if (!venue.modes_enabled.includes(input.mode)) {
    throw new Error("This order type is not available.");
  }

  // Pull the customer's current draft order. If none exists, the caller
  // tried to checkout an empty cart.
  const { data: order, error: orderError } = await supabase
    .schema("commerce")
    .from("orders")
    .select("id, state, version, currency")
    .eq("customer_id", customerId)
    .eq("venue_id", input.venueId)
    .eq("state", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("No draft order to place. Add items first.");

  // Fetch the line totals up front — we'll use them again below for the
  // tax / payment writes, ordered by created_at so the "remainder goes to
  // last line" pro-rata pattern is deterministic.
  //
  // We also pull catalog_variation_id + base_price_cents and the line's
  // modifier rows so the price-drift check below can isolate the
  // variation-only portion of base_price_cents (which is stored as
  // variation + Σ(modifier_delta × modifier_qty)) before comparing
  // it against the live catalog variation price.
  const { data: lines, error: linesError } = await supabase
    .schema("commerce")
    .from("order_line_items")
    .select(
      "id, total_price_cents, base_price_cents, catalog_variation_id, name, modifiers:order_line_item_modifiers(base_price_cents_delta, quantity)",
    )
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (linesError) throw new Error(linesError.message);
  if (!lines || lines.length === 0) {
    throw new Error("cart_empty");
  }

  // Price-drift reconciliation (S11). The cart snapshots
  // catalog_variations.price_cents into order_line_items.base_price_cents
  // at add time. If the merchant edits prices while the customer is mid-
  // cart, the snapshot is stale by the time they hit Place. Re-fetch
  // every variation's current price and bail with `price_changed` if
  // any differ — the client then refreshes the cart so the customer
  // sees the new prices before re-attempting.
  const variationIds = Array.from(
    new Set(
      lines
        .map((line) => line.catalog_variation_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  if (variationIds.length > 0) {
    const { data: livePrices, error: priceError } = await supabase
      .from("item_variations")
      .select("id, price_cents")
      .in("id", variationIds);
    if (priceError) throw new Error(priceError.message);
    const priceById = new Map<string, number>(
      (livePrices ?? []).map((row) => [row.id, row.price_cents]),
    );
    const driftedNames: string[] = [];
    for (const line of lines) {
      if (!line.catalog_variation_id) continue;
      const live = priceById.get(line.catalog_variation_id);
      // base_price_cents on the line is stored as
      //   variation.price_cents + Σ(modifier_delta × modifier_qty)
      // (see lib/cart/upsert-cart-lines.ts → perUnitCents). To compare
      // against the live variation price we have to peel the modifier
      // sum off — otherwise every line with a priced modifier would
      // false-fire drift on every place-order.
      const modifierSum = (line.modifiers ?? []).reduce(
        (sum, m) => sum + m.base_price_cents_delta * Number(m.quantity),
        0,
      );
      const storedVariationCents = line.base_price_cents - modifierSum;
      // Missing live row (variation deleted) is also drift — the cart
      // can't be placed at a snapshot price for an item that no longer
      // exists in the catalog.
      if (live === undefined || live !== storedVariationCents) {
        driftedNames.push(line.name);
      }
    }
    if (driftedNames.length > 0) {
      // Surface affected names in the error message tail so the client
      // can display them. The `price_changed` token at the head is what
      // the client matches on for i18n mapping.
      throw new Error(`price_changed:${driftedNames.join(", ")}`);
    }
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
      if (createSessionError) {
        // 23505 = a concurrent QR scan won the unique-index race. The
        // partial UNIQUE INDEX on (venue_id, table_label) WHERE
        // status='open' guarantees at most one open session per table,
        // so the loser just re-SELECTs the winner's row instead of
        // failing the order.
        if (createSessionError.code === "23505") {
          const { data: raced, error: racedError } = await supabase
            .schema("commerce")
            .from("table_sessions")
            .select("id")
            .eq("venue_id", input.venueId)
            .eq("table_label", tableLabel)
            .eq("status", "open")
            .single();
          if (racedError) throw new Error(racedError.message);
          tableSessionId = raced.id;
        } else {
          throw new Error(createSessionError.message);
        }
      } else {
        tableSessionId = createdSession.id;
      }
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

  // KRA-44 foundation: promote the checkout phone onto the customer row so it
  // becomes a durable identity handle (the cross-surface phone bridge keys off
  // it). Captured per-mode below; written once after the fulfillment branch.
  let customerPhone: string | null = null;
  // Delivery fee charged to the customer (set in the delivery branch from the
  // catalog's delivery config; 0 for other modes). Server-trusted — the client
  // never supplies it.
  let deliveryFeeCents = 0;

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
    // Phone is optional for pickup, but if the customer typed one, it
    // must match the +998 shape so we can call them back if there's a
    // problem with the order.
    let normalizedPickupPhone: string | null = null;
    if (recipientPhone && recipientPhone.trim()) {
      normalizedPickupPhone = normalizeUzPhone(recipientPhone);
      if (!normalizedPickupPhone) throw new Error("phone_invalid");
    }
    customerPhone = normalizedPickupPhone;
    const { error } = await supabase
      .schema("commerce")
      .from("fulfillment_pickup_details")
      .insert({
        fulfillment_id: fulfillment.id,
        schedule_type: scheduleType,
        pickup_at: scheduleType === "scheduled" ? pickupAt : null,
        recipient_name: recipientName?.trim() || null,
        recipient_phone: normalizedPickupPhone,
        note: note?.trim() || null,
        placed_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  } else {
    // delivery
    const {
      address,
      latitude,
      longitude,
      district,
      street,
      building,
      recipientName,
      recipientPhone,
      scheduledFor,
      note,
    } = input.fields;
    if (!address.trim()) throw new Error("Delivery address is required.");
    if (!recipientName.trim()) throw new Error("Recipient name is required.");
    if (!recipientPhone.trim()) throw new Error("Recipient phone is required.");
    // Phone is required for delivery — courier needs to call.
    const normalizedDeliveryPhone = normalizeUzPhone(recipientPhone);
    if (!normalizedDeliveryPhone) throw new Error("phone_invalid");
    customerPhone = normalizedDeliveryPhone;

    // Re-read the catalog's delivery config server-side: re-enforce the zone
    // (the client gate is bypassable) and charge the configured fee. The fee
    // is NEVER taken from the client.
    const { data: catalogRow } = await supabase
      .from("catalogs")
      .select("settings_delivery")
      .eq("id", venue.catalog_id)
      .maybeSingle();
    const deliverySettings = normalizeDeliverySettings(
      (catalogRow?.settings_delivery ?? {}) as Record<string, unknown>,
    );

    if (
      deliverySettings.enabled &&
      latitude != null &&
      longitude != null &&
      !isWithinDeliveryZone(deliverySettings, latitude, longitude)
    ) {
      throw new Error("out_of_zone");
    }

    // Enforce the delivery minimum server-side (the client gates it, but a
    // direct API call could bypass the UI).
    if (
      deliverySettings.minOrderCents > 0 &&
      lines.reduce((sum, line) => sum + line.total_price_cents, 0) <
        deliverySettings.minOrderCents
    ) {
      throw new Error("below_min_order");
    }

    deliveryFeeCents = Math.max(0, Math.round(deliverySettings.feeCents));

    const { error } = await supabase
      .schema("commerce")
      .from("fulfillment_delivery_details")
      .insert({
        fulfillment_id: fulfillment.id,
        recipient_name: recipientName.trim(),
        recipient_phone: normalizedDeliveryPhone,
        // Snapshot the picker's coordinates + structured parts alongside the
        // freeform string — needed for courier dispatch and a durable record.
        address: {
          freeform: address.trim(),
          ...(latitude != null && longitude != null
            ? { latitude, longitude }
            : {}),
          ...(district ? { district } : {}),
          ...(street ? { street } : {}),
          ...(building ? { building } : {}),
        },
        delivery_fee_cents: deliveryFeeCents,
        scheduled_for: scheduledFor,
        delivery_provider: "merchant",
        note: note?.trim() || null,
        placed_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  // Promote the checkout phone onto the customer (KRA-44 foundation). Only
  // fills an empty phone — never clobbers a number the customer already has,
  // so the order-for-a-friend case can't overwrite their own. Best-effort:
  // the order is already placed, so a failed promotion must not fail checkout.
  // The full (org, phone) dedup/merge lands with the identity-links epic.
  if (customerPhone) {
    await supabase
      .schema("commerce")
      .from("customers")
      .update({ phone: customerPhone })
      .eq("id", customerId)
      .is("phone", null);
  }

  // ---- Taxes / service fees + payments (KRA-63) ---------------------------
  // Server is the source of truth: re-read active catalog taxes fresh, never
  // trust client-side totals. Filter to the v1-supported shape so the
  // pricing util can stay branch-free.

  // Both inclusion_types: 'additive' contributes to the amount charged;
  // 'included' (UZ VAT pattern) is recorded for compliance but the menu
  // price already bakes it in, so it doesn't add to the customer's total.
  const { data: taxRows, error: taxRowsError } = await supabase
    .from("taxes")
    .select("id, name, kind, inclusion_type, percentage, version")
    .eq("catalog_id", venue.catalog_id)
    .eq("is_active", true)
    .eq("applies_to", "all_items")
    .eq("calculation_phase", "subtotal");
  if (taxRowsError) throw new Error(taxRowsError.message);

  const taxes = (taxRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as "tax" | "service_fee",
    inclusion_type: row.inclusion_type as "additive" | "included",
    percentage:
      typeof row.percentage === "string" ? Number(row.percentage) : row.percentage,
    version: row.version,
  }));

  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.total_price_cents,
    0,
  );
  const tipCents = Math.max(0, Math.floor(input.tipCents ?? 0));
  const pricing = computePricing({
    subtotalCents,
    taxes,
    tipCents,
    deliveryFeeCents,
  });

  // Tip cap pre-check (KRA-77). The DB has a CHECK constraint enforcing
  // tip_cents * 2 <= amount_cents on order_payments — we surface the
  // failure as a clean error code the client maps to the localized
  // errors.tip_too_high copy, instead of letting a raw 23514 bubble.
  const amountForTipCheck =
    subtotalCents + pricing.additiveFeesCents + pricing.deliveryFeeCents;
  if (tipCents * 2 > amountForTipCheck) {
    throw new Error("tip_too_high");
  }

  // Insert order_taxes (one per active tax). uid pattern keeps applied-tax
  // references stable: "<tax_id>" is sufficient within an order since each
  // tax appears at most once per order.
  //
  // inclusion_type lives on its own column (KRA-81). additive = added to
  // amount_cents on order_payments; included = informational, the implicit
  // portion baked into the subtotal (UZ VAT pattern).
  if (pricing.feeLines.length > 0) {
    const orderTaxRows = pricing.feeLines.map((fee) => ({
      // org_id auto-set by order_taxes_sync_org_id trigger.
      org_id: input.orgId,
      uid: fee.taxId,
      order_id: order.id,
      catalog_tax_id: fee.taxId,
      kind: fee.kind,
      inclusion_type: fee.inclusionType,
      name: fee.name,
      type: "percentage" as const,
      percentage: fee.percentage,
      amount_cents: null,
      scope: "order" as const,
      auto_applied: true,
      applied_money_cents: fee.appliedMoneyCents,
    }));
    const { error: orderTaxError } = await supabase
      .schema("commerce")
      .from("order_taxes")
      .insert(orderTaxRows);
    if (orderTaxError) throw new Error(orderTaxError.message);

    // Per-line breakdown (KRA-63 D3): distribute each tax's appliedMoney
    // across lines proportional to line.total / subtotal. The pricing util's
    // distributeProRata handles the floor + last-line-remainder math so each
    // tax's sum exactly equals appliedMoneyCents.
    const appliedRows: Array<{
      line_item_id: string;
      order_tax_uid: string;
      order_id: string;
      org_id: string;
      applied_money_cents: number;
    }> = [];
    for (const fee of pricing.feeLines) {
      const distribution = distributeProRata({
        lines,
        totalCents: fee.appliedMoneyCents,
        subtotalCents,
      });
      for (const line of lines) {
        appliedRows.push({
          line_item_id: line.id,
          order_tax_uid: fee.taxId,
          order_id: order.id,
          // applied_tax_validate trigger overwrites order_id + org_id from
          // the parent line item; this value is a placeholder.
          org_id: input.orgId,
          applied_money_cents: distribution.get(line.id) ?? 0,
        });
      }
    }
    if (appliedRows.length > 0) {
      const { error: appliedError } = await supabase
        .schema("commerce")
        .from("line_item_applied_taxes")
        .insert(appliedRows);
      if (appliedError) throw new Error(appliedError.message);
    }
  }

  // Payments row: cash-only v1, status='pending', customer's tip captured.
  // Merchant flips status to 'completed' from the orders dashboard when
  // cash is collected. amount_cents = subtotal + additive fees only;
  // 'included' fees are already baked into the subtotal so adding them
  // again would double-charge.
  //
  // Currency comes from the snapshot on commerce.orders (set by the
  // orders_sync_from_venue trigger at draft creation, frozen ever since)
  // rather than venue.currency. The two are usually equal but diverge
  // if the merchant edits venue.currency between draft creation and
  // place-order; the order's snapshot is the source of truth (KRA-80).
  const amountCents =
    subtotalCents + pricing.additiveFeesCents + pricing.deliveryFeeCents;
  const { error: paymentError } = await supabase
    .schema("commerce")
    .from("order_payments")
    .insert({
      // org_id set by order_payments_sync_org_id trigger.
      org_id: input.orgId,
      order_id: order.id,
      amount_cents: amountCents,
      tip_cents: tipCents,
      total_cents: amountCents + tipCents,
      currency: order.currency,
      status: "pending",
      source_type: "cash",
      autocomplete: true,
    });
  if (paymentError) throw new Error(paymentError.message);

  return { orderId: order.id, state: "open" };
}
