/**
 * Cart-v3 client-side state shape + reducer.
 *
 * The shape on this side of the wire is a Map<LineKey, CartEntry>. The
 * server still talks to us in its array-of-CartLineItem `CartSummary`
 * shape; we convert at the boundary (`cartFromSummary` / `summaryFromCart`).
 *
 * Why a Map instead of an array:
 *   - O(1) lookup by lineKey is the hot path (every render of every
 *     stepper on every card on the page)
 *   - Mutations are key-addressed (setQty(lineKey, n)) — no array index
 *     management, no find-then-splice
 *   - React's useOptimistic re-runs the reducer on every base-state
 *     change; cheap key-addressed merges win over array filters
 *
 * The reducer is one function with one action shape: `setQty`. Add,
 * bump, remove, and clear are all expressed as setQty calls upstream
 * — see the cart provider's hook for the wrappers. This collapses the
 * cart-v2 dual-mode reducer (id-match for materialized lines, tuple-
 * match for placeholders, permissive variation fallback) into one
 * deterministic operation: "the entry at this lineKey now has qty N".
 *
 * Pure function. No refs, no IO, no IDs allocated inside. React
 * StrictMode can call it twice per render and the output is identical.
 */

import {
  lineKeyFromServerLine,
  type LineKey,
} from "./line-key";
import type {
  CartLineItem,
  CartLineItemModifier,
  CartSummary,
} from "./orders";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * One logical cart line. The `lineKey` is the primary key; `lineId`
 * is the server-issued uuid carried purely as metadata so we can
 * surface it to the placed-order snapshot if we ever need it. We
 * never use `lineId` for mutation routing — that's what lineKey is
 * for.
 */
export type CartEntry = {
  lineKey: LineKey;
  itemId: string;
  variationId: string;
  modifierSig: string;
  name: string;
  variationName: string | null;
  basePriceCents: number;
  modifiers: CartLineItemModifier[];
  qty: number;
  /** Server uuid; null until the first server response materializes
   *  the row. Used only for the placed-order snapshot. */
  lineId: string | null;
  /** Derived: (base + sum(modifier deltas)) * qty. Kept on the entry
   *  so renders are O(1) per entry. */
  totalPriceCents: number;
  /** Item photo URL, snapshotted into the local cache so a cold-cache
   *  refresh still paints the thumbnail before the server response
   *  lands. NULL when the item has no photo. */
  imageUrl: string | null;
};

/**
 * Cart shape on the client side. Tracks the server's orderId + version
 * for OCC-style guards at place-order time.
 */
export type Cart = {
  entries: Map<LineKey, CartEntry>;
  orderId: string | null;
  version: number;
  subtotalCents: number;
};

/**
 * Empty cart sentinel. Used as the initial value when SSR didn't
 * preload (offline / no cookies / fresh visitor).
 */
export const EMPTY_CART: Cart = {
  entries: new Map(),
  orderId: null,
  version: 0,
  subtotalCents: 0,
};

// ── Pure helpers ────────────────────────────────────────────────────────────

function perUnitCents(entry: {
  basePriceCents: number;
  modifiers: CartLineItemModifier[];
}): number {
  const delta = entry.modifiers.reduce(
    (sum, m) => sum + m.base_price_cents_delta * m.quantity,
    0,
  );
  return entry.basePriceCents + delta;
}

function recomputeSubtotal(entries: Map<LineKey, CartEntry>): number {
  let total = 0;
  for (const entry of entries.values()) total += entry.totalPriceCents;
  return total;
}

// ── Boundary conversion ────────────────────────────────────────────────────

/**
 * Convert the server's CartSummary into the client's Cart shape.
 * Called on every setServerCart — once per server response.
 */
export function cartFromSummary(summary: CartSummary): Cart {
  const entries = new Map<LineKey, CartEntry>();
  for (const line of summary.lineItems) {
    if (!line.catalog_item_id || !line.catalog_variation_id) {
      // Legacy / malformed row — skip rather than crash the UI.
      continue;
    }
    const lineKey = lineKeyFromServerLine(line);
    entries.set(lineKey, {
      lineKey,
      itemId: line.catalog_item_id,
      variationId: line.catalog_variation_id,
      modifierSig: lineKey.split("::")[2] ?? "",
      name: line.name,
      variationName: line.variation_name,
      basePriceCents: line.base_price_cents,
      modifiers: line.modifiers,
      qty: line.quantity,
      lineId: line.id,
      totalPriceCents: line.total_price_cents,
      imageUrl: line.image_url,
    });
  }
  return {
    entries,
    orderId: summary.orderId,
    version: summary.version,
    subtotalCents: summary.subtotalCents,
  };
}

/**
 * Read-only view of the cart that matches the cart-v2 CartSummary shape
 * exactly. Provided so the cart-v2 stepper components keep working
 * during the P1 → P3 migration window. Once all three steppers move to
 * the lineKey-based API in P3, this helper goes away.
 *
 * Lines are emitted in deterministic key order so renders are stable
 * across re-derivations (Map iteration order is insertion order in
 * modern JS engines, so this is the order entries were added to
 * serverCart — matches the server's created_at sort).
 */
export function summaryFromCart(cart: Cart): CartSummary {
  const lineItems: CartLineItem[] = [];
  for (const entry of cart.entries.values()) {
    lineItems.push({
      id: entry.lineId ?? entry.lineKey, // back-compat: stepper code keys off id
      uid: "",
      catalog_item_id: entry.itemId,
      catalog_variation_id: entry.variationId,
      name: entry.name,
      variation_name: entry.variationName,
      quantity: entry.qty,
      base_price_cents: entry.basePriceCents,
      total_price_cents: entry.totalPriceCents,
      modifiers: entry.modifiers,
      image_url: entry.imageUrl,
    });
  }
  return {
    orderId: cart.orderId,
    version: cart.version,
    lineItems,
    subtotalCents: cart.subtotalCents,
  };
}

// ── Reducer (one action: setQty) ───────────────────────────────────────────

/**
 * The one optimistic action. Sets the absolute quantity for a given
 * `lineKey`. Insert / update / delete are all expressed through this:
 *   - qty > 0, entry exists → update qty + recompute total
 *   - qty > 0, entry absent → insert (requires `entryShape` metadata)
 *   - qty <= 0, entry exists → remove
 *   - qty <= 0, entry absent → no-op
 *
 * The reducer never mints ids, never reads refs, never branches on
 * placeholder-vs-materialized state. It's the same code path for
 * "first add" and "10th bump", which is what makes cart-v3 robust
 * against rapid taps and StrictMode double-render.
 */
export type SetQtyAction = {
  type: "setQty";
  lineKey: LineKey;
  qty: number;
  /**
   * Only required when inserting a brand-new entry (qty > 0 and no
   * matching entry exists). For bumps/removes/updates on existing
   * entries the reducer ignores this — the entry already has all
   * the metadata it needs.
   */
  entryShape?: Omit<CartEntry, "lineId" | "qty" | "totalPriceCents">;
};

export function applyAction(cart: Cart, action: SetQtyAction): Cart {
  const { lineKey, qty, entryShape } = action;
  const existing = cart.entries.get(lineKey);

  // Remove path (qty <= 0)
  if (qty <= 0) {
    if (!existing) return cart;
    const next = new Map(cart.entries);
    next.delete(lineKey);
    return {
      ...cart,
      entries: next,
      subtotalCents: recomputeSubtotal(next),
    };
  }

  // Update path (entry exists)
  if (existing) {
    if (existing.qty === qty) return cart;
    const next = new Map(cart.entries);
    const totalPriceCents = perUnitCents(existing) * qty;
    next.set(lineKey, { ...existing, qty, totalPriceCents });
    return {
      ...cart,
      entries: next,
      subtotalCents: recomputeSubtotal(next),
    };
  }

  // Insert path (entry doesn't exist yet)
  if (!entryShape) {
    // Programmer error: caller asked to set qty on a missing entry
    // without providing the shape. We can't fabricate the name /
    // price / modifiers, so we no-op. The cart-provider's `add`
    // wrapper is responsible for always passing entryShape on first
    // add — and dev-mode this would throw, but at runtime we'd
    // rather lose the add than crash the render.
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[cart-state] setQty on missing entry without entryShape",
        { lineKey, qty },
      );
    }
    return cart;
  }

  const totalPriceCents = perUnitCents(entryShape) * qty;
  const next = new Map(cart.entries);
  next.set(lineKey, { ...entryShape, qty, lineId: null, totalPriceCents });
  return {
    ...cart,
    entries: next,
    subtotalCents: recomputeSubtotal(next),
  };
}

// ── Read helpers (for the hook) ────────────────────────────────────────────

export function getQty(cart: Cart, lineKey: LineKey): number {
  return cart.entries.get(lineKey)?.qty ?? 0;
}

export function getEntry(cart: Cart, lineKey: LineKey): CartEntry | undefined {
  return cart.entries.get(lineKey);
}

export function getItemCount(cart: Cart): number {
  let total = 0;
  for (const entry of cart.entries.values()) total += entry.qty;
  return total;
}
