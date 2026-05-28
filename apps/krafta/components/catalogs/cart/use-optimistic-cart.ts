"use client";

import { useOptimistic } from "react";

import type { LineKey } from "@/lib/cart/line-key";
import type {
  CartLineItem,
  CartLineItemModifier,
  CartSummary,
} from "@/lib/cart/orders";

/**
 * cart-v3 optimistic reducer (batch refactor).
 *
 * One action shape — `setLine` with an absolute target. The reducer
 * is idempotent under N-deep re-application: applying the same
 * `setLine(coffee, qty=5)` action twice produces the same state.
 * That property is what makes batched optimism safe under cross-tab
 * Realtime refreshes — when a refresh fires mid-batch, React replays
 * every pending optimistic action on top of the new server state,
 * and re-application is a no-op when the action already matches.
 *
 * Composability matters too: rapid + + + + + taps generate
 * `[setLine(c,2), setLine(c,3), setLine(c,4), setLine(c,5), setLine(c,6)]`.
 * Sequential application yields the last-writer-wins value (qty=6)
 * for any starting serverCart, so the optimistic state stays at qty=6
 * regardless of when the server's writes interleave.
 *
 * `clear` is just N parallel `setLine(*, null)` actions, one per
 * existing lineKey at clear time. No special-case reducer logic.
 *
 * The action's `target` carries enough metadata to build a placeholder
 * line when the targeted lineKey doesn't yet exist on the server
 * (first add of an item). For updates the metadata is unused — the
 * existing line's fields are kept; only quantity and the derived
 * total_price_cents change.
 */

export type SetLineTarget = {
  qty: number;
  itemId: string;
  variationId: string;
  name: string;
  variationName: string | null;
  basePriceCents: number;
  /** Per-unit price after modifier deltas. The reducer uses this for
   *  the placeholder's `total_price_cents` so the cart subtotal
   *  reflects the customer's intent even before the server response
   *  lands. Computed at scheduleSetLine time from the catalog card's
   *  data. */
  perUnitCents: number;
  modifiers: CartLineItemModifier[];
  modifierSig: string;
};

export type OptimisticCartAction = {
  type: "setLine";
  lineKey: LineKey;
  /** `null` means "the line at this lineKey should not exist after the
   *  action lands." For deletes this is also what the server's batch
   *  payload sends (`qty=0`). */
  target: SetLineTarget | null;
  /** Per-tap UUID. Used purely for tracing / debug logging. NOT the
   *  server idempotency key — those are minted per batch flush. */
  actionId: string;
};

// ── Pure helpers ────────────────────────────────────────────────────────────

function recomputeSubtotal(lineItems: CartLineItem[]): number {
  return lineItems.reduce((sum, l) => sum + l.total_price_cents, 0);
}

function buildPlaceholderLine(
  lineKey: LineKey,
  target: SetLineTarget,
): CartLineItem {
  return {
    id: lineKey,
    uid: "",
    catalog_item_id: target.itemId,
    catalog_variation_id: target.variationId,
    name: target.name,
    variation_name: target.variationName,
    quantity: target.qty,
    base_price_cents: target.basePriceCents,
    total_price_cents: target.perUnitCents * target.qty,
    modifiers: target.modifiers,
  };
}

// ── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer: serverState + action → predicted state.
 *
 * Runs synchronously on every render of useOptimistic. NEVER mutates
 * its inputs. NEVER reads from refs or external state — same inputs
 * always produce the same output.
 */
export function applyAction(
  state: CartSummary,
  action: OptimisticCartAction,
): CartSummary {
  const { lineKey, target } = action;

  // Delete path: target=null. If the line isn't in state, no-op
  // (idempotent under re-application after a cross-tab delete).
  if (target === null) {
    const existing = state.lineItems.find((l) => l.id === lineKey);
    if (!existing) return state;
    const next = state.lineItems.filter((l) => l.id !== lineKey);
    return {
      ...state,
      lineItems: next,
      subtotalCents: recomputeSubtotal(next),
    };
  }

  // Upsert path: target carries the absolute qty + metadata.
  const existingIndex = state.lineItems.findIndex((l) => l.id === lineKey);

  if (existingIndex >= 0) {
    // Update in place. The line already exists on the server (its
    // server uuid was normalized to lineKey via normalizeSummary); we
    // only mutate quantity and the derived total. The line's
    // immutable metadata (item, variation, modifier rows) stays.
    const existing = state.lineItems[existingIndex];
    if (existing.quantity === target.qty) return state;
    const next = [...state.lineItems];
    next[existingIndex] = {
      ...existing,
      quantity: target.qty,
      total_price_cents: target.perUnitCents * target.qty,
    };
    return {
      ...state,
      lineItems: next,
      subtotalCents: recomputeSubtotal(next),
    };
  }

  // Insert path: lineKey not present. Append a placeholder built
  // from the action's metadata.
  const placeholder = buildPlaceholderLine(lineKey, target);
  const next = [...state.lineItems, placeholder];
  return {
    ...state,
    lineItems: next,
    subtotalCents: recomputeSubtotal(next),
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Wrap React's useOptimistic with the cart reducer pre-bound. Returns
 * `[optimisticCart, addOptimistic]` where addOptimistic must be called
 * inside startTransition (React enforces this).
 */
export function useOptimisticCart(
  serverCart: CartSummary,
): [CartSummary, (action: OptimisticCartAction) => void] {
  return useOptimistic(serverCart, applyAction);
}
