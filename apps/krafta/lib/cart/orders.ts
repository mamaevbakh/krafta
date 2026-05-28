import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { QR_SOURCE_COOKIE } from "./qr-source-cookie";
import { ensureCartIdentity, type CartIdentity } from "./identity";
import { modifierSignature, type ModifierSelection } from "./modifier-signature";

/**
 * Identity hint accepted by every cart helper to skip an `ensureCartIdentity`
 * round-trip. The action layer resolves identity ONCE per request and threads
 * it through; orders.ts internals only fall back to `ensureCartIdentity` when
 * the hint is missing (e.g. legacy callers or direct CLI scripts).
 *
 * Trust model: even if a malicious client lied about its `customerId`, the
 * `commerce.*` RLS policies (which scope rows to
 * `commerce.customers.user_id = auth.uid()`) would still reject every read
 * and write. The hint is a performance optimization, not a privilege grant.
 */
async function resolveCartIdentity(
  orgId: string,
  hint?: CartIdentity,
): Promise<CartIdentity> {
  if (hint?.customerId && hint?.userId) return hint;
  return ensureCartIdentity(orgId);
}

/**
 * Reads the QR-source cookie set by /q/[code] on scan-driven landings.
 * Returns 'qr_scan' if the customer arrived via a scanned QR within the
 * 15-minute attribution window, otherwise undefined. Used by
 * getOrCreateDraftOrder to stamp commerce.orders.source.
 *
 * Kept as a tiny helper (not inlined) so the source-of-truth for cookie
 * → enum mapping lives in one place.
 */
async function detectQrSource(): Promise<"qr_scan" | undefined> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(QR_SOURCE_COOKIE);
  // Cookie value is the shortcode (8 hex chars). Presence + shape check
  // is all we need — we don't re-validate the shortcode against qr_codes
  // because the scan already did, and faking the cookie just attributes
  // your own order to QR rather than web; not a meaningful exploit.
  return cookie && /^[a-f0-9]{1,32}$/i.test(cookie.value)
    ? "qr_scan"
    : undefined;
}

export type CartLineItemModifier = {
  id: string;
  catalog_modifier_id: string | null;
  /** Parent modifier_list id. Always set on rows written after KRA-96.
   *  NULL on legacy rows from before the migration; cart drawer falls
   *  back to other fields when displaying those. */
  catalog_modifier_list_id: string | null;
  name: string;
  base_price_cents_delta: number;
  quantity: number;
  /** Text-mode only: the customer-typed string. NULL for list-mode rows. */
  text_value: string | null;
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
  /** Pre-resolved identity from the action layer. Skips ensureCartIdentity
   *  when present — saves a round-trip on the hot path. See resolveCartIdentity. */
  identity?: CartIdentity;
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
  const { customerId } = await resolveCartIdentity(input.orgId, input.identity);

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

  // Resolve order source. Explicit caller-passed source wins (e.g. a
  // future Telegram-Mini-App flow), then the QR-scan cookie set by
  // /q/[code], then the default 'web'. Only checked when we're actually
  // creating a draft — existing draft's source is locked-in from its
  // first creation (no migration of an in-flight cart).
  const resolvedSource =
    input.source ?? (await detectQrSource()) ?? "web";

  // The BEFORE-INSERT trigger `orders_sync_from_venue` overwrites the NOT
  // NULL fields below from the venue row: org_id, catalog_id, currency,
  // timezone. We pass placeholders to satisfy the type system; the trigger
  // sets the correct values (KRA-80).
  const { data: created, error: insertError } = await supabase
    .schema("commerce")
    .from("orders")
    .insert({
      org_id: input.orgId,
      catalog_id: input.orgId,
      currency: "USD",
      timezone: "UTC",
      venue_id: input.venueId,
      customer_id: customerId,
      state: "draft",
      source: resolvedSource,
    })
    .select("id, version")
    .single();

  if (insertError || !created) {
    // 23505 = the partial UNIQUE INDEX on (customer_id, venue_id) WHERE
    // state='draft' (KRA-77 migration) fired because two parallel adds
    // both passed the maybeSingle() check above and raced into INSERT.
    // The loser re-SELECTs the winner's row instead of failing.
    if (insertError?.code === "23505") {
      const { data: raced, error: racedError } = await supabase
        .schema("commerce")
        .from("orders")
        .select("id, version")
        .eq("customer_id", customerId)
        .eq("venue_id", input.venueId)
        .eq("state", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (racedError || !raced) {
        throw new Error(
          racedError?.message ?? "Failed to recover from draft order race.",
        );
      }
      return { orderId: raced.id, version: raced.version, customerId };
    }
    throw new Error(insertError?.message ?? "Failed to create draft order.");
  }

  return { orderId: created.id, version: created.version, customerId };
}

// Resolved snapshot of a modifier ready to be written to
// commerce.order_line_item_modifiers. Built from the catalog's modifier rows
// (server queries them fresh) so the snapshot can't be forged client-side.
//
// Two flavors:
//   - list-mode: catalog_modifier_id + catalog_modifier_list_id both set,
//     text_value=null
//   - text-mode: catalog_modifier_id=null, catalog_modifier_list_id set,
//     text_value=<customer typed string>, base_price_cents_delta=0,
//     quantity=1
type ResolvedModifier = {
  catalog_modifier_id: string | null;
  catalog_modifier_list_id: string;
  catalog_version: number;
  name: string;
  base_price_cents_delta: number;
  quantity: number;
  ordinal: number;
  text_value: string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type IMLRow = {
  modifier_list_id: string;
  ordinal: number;
  min_selected_override: number | null;
  max_selected_override: number | null;
  hidden_from_customer_override: boolean;
  modifier_lists: {
    id: string;
    name: string;
    min_selected: number;
    max_selected: number | null;
    is_active: boolean;
    modifier_type: "list" | "text";
    text_required: boolean;
    max_length: number | null;
    version: number;
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

/**
 * Fetches the item's modifier-list rows (with embedded list + modifier
 * details). Split out from resolveModifierSelections so setLineQuantity
 * can issue this query in parallel with the item, variation, and draft-
 * order lookups — three sequential 200ms RTs become one 200ms RT.
 */
export async function fetchItemModifierLists(
  supabase: SupabaseClient,
  itemId: string,
): Promise<IMLRow[]> {
  // `ordinal` lives on item_modifier_lists (the JOIN row — per-item list
  // ordering), NOT on modifier_lists itself (lists are reusable across
  // items and have no intrinsic order). Selecting it under
  // modifier_lists!inner(...) threw "column modifier_lists_1.ordinal
  // does not exist" — a runtime bug caught on first cart add. The
  // ordinal we want for the kitchen receipt is the order the list
  // appears on THIS item, which is `item_modifier_lists.ordinal`.
  const { data: imlRows, error } = await supabase
    .from("item_modifier_lists")
    .select(
      "modifier_list_id, ordinal, min_selected_override, max_selected_override, hidden_from_customer_override, modifier_lists!inner(id, name, min_selected, max_selected, is_active, modifier_type, text_required, max_length, version, modifiers(id, name, price_cents, ordinal, on_by_default, is_active, version))",
    )
    .eq("item_id", itemId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (imlRows ?? []) as unknown as IMLRow[];
}

// Validates the customer's modifier picks against pre-fetched IML rows
// (with overrides), and expands hidden-from-customer lists with their
// on_by_default modifiers (the customer never sees those, but the kitchen
// must — Square parity).
//
// Pure / synchronous after the fetchItemModifierLists split — separates the
// I/O concern from the validation concern, lets the caller parallelize the
// IML fetch with other reads (see set-line-quantity.ts).
export function resolveModifierSelections(
  imls: IMLRow[],
  selections: ModifierSelection[],
): ResolvedModifier[] {

  // Lookup tables: modifier_id → (list_id, modifier row) for list-mode;
  // list_id → IML row for both modes (text-mode validation needs it too).
  const modifierLookup = new Map<
    string,
    { listId: string; mod: IMLRow["modifier_lists"]["modifiers"][number] }
  >();
  const imlByListId = new Map<string, IMLRow>();
  for (const iml of imls) {
    if (!iml.modifier_lists.is_active) continue;
    imlByListId.set(iml.modifier_lists.id, iml);
    for (const mod of iml.modifier_lists.modifiers) {
      if (!mod.is_active) continue;
      modifierLookup.set(mod.id, { listId: iml.modifier_lists.id, mod });
    }
  }

  // Group user selections by list, splitting list-mode and text-mode into
  // separate buckets so per-list validation is one branch per kind. Hidden
  // lists never accept customer input — supplying one is treated as
  // tampering.
  const listSelectionsByList = new Map<string, ModifierSelection[]>();
  const textSelectionByList = new Map<string, ModifierSelection>();
  for (const sel of selections) {
    if (sel.quantity <= 0) continue;
    const iml = imlByListId.get(sel.listId);
    if (!iml) {
      throw new Error("Selected modifier is not available for this item.");
    }
    if (iml.hidden_from_customer_override) {
      throw new Error("Selected modifier is not available for this item.");
    }
    if (iml.modifier_lists.modifier_type === "text") {
      if (sel.modifierId !== null) {
        throw new Error("Selected modifier is not available for this item.");
      }
      // Text-mode: at most one selection per list (the customer types one
      // string per text field). If multiple come in, treat that as
      // tampering rather than silently merging.
      if (textSelectionByList.has(sel.listId)) {
        throw new Error("Selected modifier is not available for this item.");
      }
      textSelectionByList.set(sel.listId, sel);
      continue;
    }
    // List-mode: the modifierId must reference a row in this list.
    if (sel.modifierId === null) {
      throw new Error("Selected modifier is not available for this item.");
    }
    const entry = modifierLookup.get(sel.modifierId);
    if (!entry || entry.listId !== sel.listId) {
      throw new Error("Selected modifier is not available for this item.");
    }
    const list = listSelectionsByList.get(sel.listId) ?? [];
    list.push(sel);
    listSelectionsByList.set(sel.listId, list);
  }

  // Per-list constraint enforcement on customer-visible lists.
  for (const iml of imls) {
    if (iml.hidden_from_customer_override) continue;
    const list = iml.modifier_lists;
    if (list.modifier_type === "text") {
      const sel = textSelectionByList.get(list.id);
      const trimmed = sel?.text_value?.trim() ?? "";
      const hasValue = trimmed.length > 0;
      if (list.text_required && !hasValue) {
        throw new Error("Please make the required modifier selections.");
      }
      if (
        sel &&
        list.max_length !== null &&
        sel.text_value !== null &&
        sel.text_value.length > list.max_length
      ) {
        throw new Error("Text modifier exceeds maximum length.");
      }
      continue;
    }
    // list-mode: count DISTINCT selections. Per-modifier quantity is
    // independent and bounded by the client; here we only validate the
    // catalog-level min/max for the list.
    const minSelected = iml.min_selected_override ?? list.min_selected;
    const maxSelected = iml.max_selected_override ?? list.max_selected;
    const sels = listSelectionsByList.get(list.id) ?? [];
    const distinctCount = sels.length;
    if (distinctCount < minSelected) {
      throw new Error("Please make the required modifier selections.");
    }
    if (maxSelected !== null && distinctCount > maxSelected) {
      throw new Error("Too many modifiers selected.");
    }
  }

  // Assemble the resolved set: customer picks (list + text) + auto-applied
  // defaults from hidden lists. The customer cannot touch the hidden lists,
  // so any conflict is impossible by construction.
  const resolved: ResolvedModifier[] = [];
  // Customer list-mode picks
  for (const sels of listSelectionsByList.values()) {
    for (const sel of sels) {
      if (sel.quantity <= 0 || sel.modifierId === null) continue;
      const entry = modifierLookup.get(sel.modifierId);
      if (!entry) continue;
      resolved.push({
        catalog_modifier_id: entry.mod.id,
        catalog_modifier_list_id: entry.listId,
        catalog_version: entry.mod.version,
        name: entry.mod.name,
        base_price_cents_delta: entry.mod.price_cents,
        quantity: sel.quantity,
        ordinal: entry.mod.ordinal,
        text_value: null,
      });
    }
  }
  // Customer text-mode picks. Use the list's localized snapshot name
  // wasn't possible server-side (we don't have the customer's locale here),
  // so the canonical list.name is the snapshot — receipts and the cart
  // drawer will display the typed text alongside it.
  for (const [listId, sel] of textSelectionByList.entries()) {
    const iml = imlByListId.get(listId);
    if (!iml) continue;
    const trimmed = sel.text_value?.trim() ?? "";
    if (trimmed.length === 0) continue; // optional-text empty → skip
    resolved.push({
      catalog_modifier_id: null,
      catalog_modifier_list_id: listId,
      catalog_version: iml.modifier_lists.version,
      name: iml.modifier_lists.name,
      base_price_cents_delta: 0,
      quantity: 1,
      // Per-item list ordering comes from the join row, not the list itself
      // (lists are reusable across items so they have no intrinsic order).
      ordinal: iml.ordinal,
      text_value: trimmed,
    });
  }
  // Auto-applied on_by_default modifiers from hidden lists
  for (const iml of imls) {
    if (!iml.hidden_from_customer_override) continue;
    if (!iml.modifier_lists.is_active) continue;
    if (iml.modifier_lists.modifier_type === "text") continue; // hidden+text makes no sense
    for (const mod of iml.modifier_lists.modifiers) {
      if (!mod.is_active || !mod.on_by_default) continue;
      resolved.push({
        catalog_modifier_id: mod.id,
        catalog_modifier_list_id: iml.modifier_lists.id,
        catalog_version: mod.version,
        name: mod.name,
        base_price_cents_delta: mod.price_cents,
        quantity: 1,
        ordinal: mod.ordinal,
        text_value: null,
      });
    }
  }

  return resolved;
}

/**
 * Reads the cart for the current customer at the given venue. Returns null-ish
 * shape (no order, empty lines) when the customer has no draft yet so
 * components can render "empty cart" without conditional walls of code.
 *
 * Optional hints (`identity`, `orderId`) let callers that already know these
 * values (typically the action layer right after a mutation) skip the
 * corresponding lookups. With both hints we collapse 4 round-trips down to a
 * single embedded query.
 */
export async function getCartSummary(input: {
  orgId: string;
  venueId: string;
  identity?: CartIdentity;
  orderId?: string;
}): Promise<CartSummary> {
  const supabase = await createClient();

  // Embedded select: lines + their modifiers in ONE round-trip (down from
  // two). The modifiers join lives at the same nesting depth as the lines
  // select so the response shape is `{ ..., modifiers: [...] }` per line.
  const LINE_SELECT =
    "id, uid, catalog_item_id, catalog_variation_id, name, variation_name, quantity, base_price_cents, total_price_cents, modifiers:order_line_item_modifiers(id, catalog_modifier_id, catalog_modifier_list_id, name, base_price_cents_delta, quantity, ordinal, text_value)";

  // Fast path: caller already knows the orderId (most common — the action
  // layer just created the draft or just mutated it). Skip the identity
  // resolution AND the orders lookup; jump straight to fetching lines.
  if (input.orderId) {
    const { data: lines, error: linesError } = await supabase
      .schema("commerce")
      .from("order_line_items")
      .select(LINE_SELECT)
      .eq("order_id", input.orderId)
      .order("created_at", { ascending: true });
    if (linesError) throw new Error(linesError.message);

    const hiddenByItem = await fetchHiddenModifierListsForItems(
      supabase,
      lines ?? [],
    );
    const lineItems = (lines ?? []).map((row) =>
      normalizeLineItem(row, hiddenByItem),
    );
    return {
      orderId: input.orderId,
      // No version round-trip on the fast path — callers that need the OCC
      // version use the orders SELECT path below.
      version: 0,
      lineItems,
      subtotalCents: lineItems.reduce(
        (sum, line) => sum + line.total_price_cents,
        0,
      ),
    };
  }

  // Slow path: resolve identity and look up the draft order ourselves. Still
  // benefits from the embedded lines+modifiers select (one RT instead of two).
  const { customerId } = await resolveCartIdentity(input.orgId, input.identity);

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
    .select(LINE_SELECT)
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  if (linesError) throw new Error(linesError.message);

  const hiddenByItem = await fetchHiddenModifierListsForItems(
    supabase,
    lines ?? [],
  );
  const lineItems = (lines ?? []).map((row) =>
    normalizeLineItem(row, hiddenByItem),
  );
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

/**
 * Builds a per-item map of modifier_list_ids whose contents are hidden from
 * the customer. Used by `normalizeLineItem` to strip auto-applied hidden
 * modifiers from the cart-summary response so:
 *
 *   1. The customer cart drawer doesn't leak kitchen-only / VAT / surcharge
 *      modifiers as visible bullet rows.
 *   2. The CLIENT-computed line modifier signature matches the SERVER-side
 *      visible-only signature (KRA-cart-double-add bug — without this filter
 *      the matchingLine probe in item-detail-fullscreen-view fails
 *      byte-comparison against a stored line with hidden mods baked
 *      in, the button shows "Add to cart" again, the customer taps once
 *      more, and the server merges into the existing line → qty=2).
 *
 * One extra round-trip per getCartSummary call (a batched IN query scoped
 * to the catalog item ids actually present in the cart — usually <10 items
 * and indexed on item_id). Negligible vs. the correctness win.
 */
async function fetchHiddenModifierListsForItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lines: ReadonlyArray<{ catalog_item_id: string | null }>,
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  const itemIds = Array.from(
    new Set(
      lines
        .map((l) => l.catalog_item_id)
        .filter((id): id is string => id !== null),
    ),
  );
  if (itemIds.length === 0) return result;

  const { data: imls, error: imlError } = await supabase
    .from("item_modifier_lists")
    .select("item_id, modifier_list_id")
    .in("item_id", itemIds)
    .eq("hidden_from_customer_override", true);
  // Non-fatal: if the IML lookup fails (auth race, network blip), we
  // degrade to returning the unfiltered modifiers — the cart still works,
  // just shows the hidden mods. Better than 500-ing the whole summary.
  if (imlError || !imls) return result;

  for (const row of imls) {
    let set = result.get(row.item_id);
    if (!set) {
      set = new Set();
      result.set(row.item_id, set);
    }
    set.add(row.modifier_list_id);
  }
  return result;
}

// Coerces the PostgREST embedded-select row shape into the CartLineItem
// shape the client expects. Centralized so the fast + slow paths in
// getCartSummary stay in sync.
type RawLineItem = {
  id: string;
  uid: string;
  catalog_item_id: string | null;
  catalog_variation_id: string | null;
  name: string;
  variation_name: string | null;
  quantity: number | string;
  base_price_cents: number;
  total_price_cents: number;
  modifiers:
    | Array<{
        id: string;
        catalog_modifier_id: string | null;
        catalog_modifier_list_id: string | null;
        name: string;
        base_price_cents_delta: number;
        quantity: number | string;
        ordinal: number;
        text_value: string | null;
      }>
    | null;
};

function normalizeLineItem(
  row: RawLineItem,
  hiddenByItem: Map<string, Set<string>>,
): CartLineItem {
  // Hidden modifiers are kitchen-only / VAT / surcharge auto-applies. They
  // exist on the DB row (kitchen receipts need them) but must not surface
  // in the customer cart drawer, and they MUST not contribute to the
  // signature the client computes when probing for a matching line — see
  // fetchHiddenModifierListsForItems for the full story.
  const hiddenForThisItem =
    row.catalog_item_id !== null ? hiddenByItem.get(row.catalog_item_id) : null;
  const modifiers = (row.modifiers ?? [])
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((m) => {
      if (m.catalog_modifier_list_id === null) return true;
      return !hiddenForThisItem?.has(m.catalog_modifier_list_id);
    })
    .map((m) => ({
      id: m.id,
      catalog_modifier_id: m.catalog_modifier_id,
      catalog_modifier_list_id: m.catalog_modifier_list_id,
      name: m.name,
      base_price_cents_delta: m.base_price_cents_delta,
      quantity: Number(m.quantity),
      text_value: m.text_value,
    }));
  return {
    id: row.id,
    uid: row.uid,
    catalog_item_id: row.catalog_item_id,
    catalog_variation_id: row.catalog_variation_id,
    name: row.name,
    variation_name: row.variation_name,
    quantity: Number(row.quantity),
    base_price_cents: row.base_price_cents,
    total_price_cents: row.total_price_cents,
    modifiers,
  };
}
