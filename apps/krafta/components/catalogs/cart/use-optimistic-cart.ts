"use client";

import { useOptimistic } from "react";

import { modifierSignature, type ModifierSelection } from "@/lib/cart/modifier-signature";
import type {
  CartLineItem,
  CartLineItemModifier,
  CartSummary,
} from "@/lib/cart/orders";

/**
 * Hydrogen-style optimistic cart hook (KRA-108).
 *
 * The shape:
 *
 *   const [serverCart, setServerCart] = useState(initialSummary);
 *   const [optimisticCart, addOptimistic] = useOptimisticCart(serverCart);
 *
 *   // Each cart mutation:
 *   startTransition(async () => {
 *     addOptimistic({ type, ...payload });
 *     const next = await cartAction({...});
 *     setServerCart(next);
 *   });
 *
 * Why this beats the pre-v2 8-layer state machine:
 *   - Optimistic state is DERIVED. Every render recomputes
 *     applyAction(serverCart, pendingActions) from scratch. No
 *     accumulator maps, no debounce timers, no race-aware drain.
 *   - When the transition resolves (await returns), React clears
 *     this transition's optimistic update AND commits setServerCart
 *     in the same tick. The customer never sees the cart "double
 *     count" or flicker between optimistic and server state.
 *   - Multiple concurrent transitions stack: tap A then tap B before
 *     A's server roundtrip returns and `optimisticCart` shows
 *     applyAction(applyAction(serverCart, A), B). When A's server
 *     call resolves, A clears; useOptimistic re-runs the reducer
 *     with B still pending → applyAction(serverWithA, B). When B
 *     resolves: serverWithAB, no optimistic on top.
 *
 * The reducer mirrors the server-side dedup contract — `(item,
 * variation, modifier_signature)` triple. Permissive variation
 * match: when the optimistic add carries `variationId=null` (the
 * catalog-card Add path doesn't know the default variation), match
 * ANY server line with the same (itemId, sig). Without this, the
 * placeholder co-exists with the materialized server line and the
 * stepper double-counts (the bug fixed in 2f30624; preserved here
 * structurally).
 */

export type OptimisticCartAction =
  | {
      type: "add";
      itemId: string;
      variationId: string | null;
      /**
       * cart-v3 P3 fix: absolute target quantity after this action lands,
       * NOT a delta. The caller computes `existing.quantity + intent` at
       * dispatch time using the latest optimisticCart (via ref). Going
       * absolute closes the "server response commits before useOptimistic
       * clears the action" flicker class: re-applying a `setQty(2)`
       * action on top of a serverCart that already has the line at qty=2
       * is a no-op, where the old delta semantics produced a transient
       * qty=3 between commit and clear (one frame of stepper → minus
       * icon → trash, observable to the customer on a single tap).
       */
      targetQty: number;
      name: string;
      variationName: string | null;
      basePriceCents: number;
      modifiers: CartLineItemModifier[];
      modifierSig: string;
      idempotencyKey: string;
      /**
       * Caller-allocated placeholder line id used when no existing line
       * matches (item, variation, sig). MUST live on the action so the
       * reducer stays pure: `useOptimistic` re-runs the reducer on every
       * render, and React's StrictMode dev-mode double-invoke calls it
       * twice per render. If we generated `crypto.randomUUID()` inside
       * the reducer, the placeholder's React `key` would change on
       * every render → list item unmounts/remounts on every parent
       * re-render while an add is in flight → flicker, animation
       * restarts, sometimes input focus loss. Allocating at the call
       * site (where it's a one-time event) keeps the id stable across
       * the optimistic action's lifetime.
       */
      placeholderId: string;
    }
  | {
      type: "updateQuantity";
      lineItemId: string;
      quantity: number;
      idempotencyKey: string;
    }
  | {
      type: "remove";
      lineItemId: string;
      idempotencyKey: string;
    }
  | {
      type: "clear";
      idempotencyKey: string;
    };

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers

function lineModifierSig(line: CartLineItem): string {
  return modifierSignature(
    line.modifiers
      .filter((m) => m.catalog_modifier_list_id !== null)
      .map((m) => ({
        listId: m.catalog_modifier_list_id as string,
        modifierId: m.catalog_modifier_id,
        quantity: m.quantity,
        text_value: m.text_value,
      })),
  );
}

function perUnitCents(line: {
  base_price_cents: number;
  modifiers: CartLineItemModifier[];
}): number {
  const delta = line.modifiers.reduce(
    (sum, m) => sum + m.base_price_cents_delta * m.quantity,
    0,
  );
  return line.base_price_cents + delta;
}

function recomputeSubtotal(lineItems: CartLineItem[]): number {
  return lineItems.reduce((sum, l) => sum + l.total_price_cents, 0);
}

/**
 * Compute the helper used to derive ModifierSelection[] from the addItem
 * payload's `modifiers` field. Exposed so callers (CartProvider) can
 * compute `modifierSig` once per action without duplicating logic.
 */
export function toModifierSelections(
  modifiers: ReadonlyArray<{
    modifierListId: string;
    modifierId: string | null;
    quantity: number;
    text_value: string | null;
  }> | undefined,
): ModifierSelection[] {
  return (modifiers ?? []).map((m) => ({
    listId: m.modifierListId,
    modifierId: m.modifierId,
    quantity: m.quantity,
    text_value: m.text_value,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Reducer

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
  switch (action.type) {
    case "add": {
      // Dedup by (item, variation, sig). Variation match is permissive
      // when the action's variationId is null — server resolves "no
      // variation specified" to the item's default variation and returns
      // a real UUID. Strict variation equality would miss that case and
      // leave a duplicate placeholder line in the optimistic state next
      // to the materialized server line (the pre-fix 2f30624 bug).
      const matchingIndex = state.lineItems.findIndex(
        (line) =>
          line.catalog_item_id === action.itemId &&
          lineModifierSig(line) === action.modifierSig &&
          (action.variationId === null ||
            line.catalog_variation_id === action.variationId),
      );

      if (matchingIndex >= 0) {
        // Absolute-qty SET (cart-v3 P3 flicker fix). The caller
        // computes `existing.quantity + intent` at dispatch using
        // the LATEST optimisticCart, so re-applying this action on
        // top of an already-committed serverCart yields the same
        // qty — no transient overshoot between setServerCart commit
        // and useOptimistic clearing the pending action.
        const next = [...state.lineItems];
        const existing = next[matchingIndex];
        const nextQty = action.targetQty;
        if (existing.quantity === nextQty) return state;
        next[matchingIndex] = {
          ...existing,
          quantity: nextQty,
          total_price_cents: perUnitCents(existing) * nextQty,
        };
        return {
          ...state,
          lineItems: next,
          subtotalCents: recomputeSubtotal(next),
        };
      }

      // No match — append a placeholder line at the action's
      // targetQty (which, for a brand-new line, is just the customer's
      // intent — 1 on a fresh tap, N on a programmatic add-N path).
      // We use the CALLER-ALLOCATED id (passed on the action) instead
      // of generating one here, so the reducer stays pure — see the
      // doc comment on OptimisticCartAction.add.placeholderId.
      const placeholder: CartLineItem = {
        id: action.placeholderId,
        uid: "",
        catalog_item_id: action.itemId,
        catalog_variation_id: action.variationId,
        name: action.name,
        variation_name: action.variationName,
        quantity: action.targetQty,
        base_price_cents: action.basePriceCents,
        total_price_cents:
          perUnitCents({
            base_price_cents: action.basePriceCents,
            modifiers: action.modifiers,
          }) * action.targetQty,
        modifiers: action.modifiers,
      };
      const next = [...state.lineItems, placeholder];
      return {
        ...state,
        lineItems: next,
        subtotalCents: recomputeSubtotal(next),
      };
    }

    case "updateQuantity": {
      if (action.quantity <= 0) {
        const next = state.lineItems.filter(
          (line) => line.id !== action.lineItemId,
        );
        return {
          ...state,
          lineItems: next,
          subtotalCents: recomputeSubtotal(next),
        };
      }
      const next = state.lineItems.map((line) =>
        line.id === action.lineItemId
          ? {
              ...line,
              quantity: action.quantity,
              total_price_cents: perUnitCents(line) * action.quantity,
            }
          : line,
      );
      return {
        ...state,
        lineItems: next,
        subtotalCents: recomputeSubtotal(next),
      };
    }

    case "remove": {
      const next = state.lineItems.filter(
        (line) => line.id !== action.lineItemId,
      );
      return {
        ...state,
        lineItems: next,
        subtotalCents: recomputeSubtotal(next),
      };
    }

    case "clear": {
      return { ...state, lineItems: [], subtotalCents: 0 };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Hook

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
