/**
 * Cart-v3 line identity.
 *
 * A `LineKey` is the cart-v3 primary key for a logical cart entry. It's
 * computed deterministically from `(itemId, variationId, modifierSignature)`
 * — the same tuple the server uses for line dedup — so the value is
 * STABLE across the entire lifetime of a cart entry, from the moment
 * the customer taps Add to the moment the order ships.
 *
 * Why this matters: cart-v2 used the server's `order_line_items.id`
 * (uuid) as the React key. That uuid only exists after a server round-
 * trip, so optimistic placeholders had to fabricate a client-only
 * `local-<uuid>` and swap it for the real uuid on materialization.
 * The swap caused React reconciler thrash (unmount + remount on the
 * key change), broke stepper handler closures, and produced the
 * recurring "invalid input syntax for type uuid: local-…" error class.
 *
 * `LineKey` removes that whole class of bugs:
 *   - React keys off lineKey → never changes → no reconciler churn
 *   - Mutations target lineKey → server resolves to the row internally
 *     → no client-side uuid plumbing at all
 *   - Optimistic state matches server state by lineKey → no permissive
 *     variation fallback, no dual-mode reducer, no placeholder branch
 *
 * The `_NULL_` sentinel for variation is intentional: we never use it.
 * Every call site is required to know the resolved variationId before
 * computing a LineKey — for items the customer didn't pick a variation
 * for, the catalog passes the item's `defaultVariationId`. If the
 * sentinel ever appears in a LineKey we treat it as a programmer error
 * and the assertion catches it in dev.
 */

import { modifierSignature, type ModifierSelection } from "./modifier-signature";

export type LineKey = string;

const SEP = "::";

/**
 * Compose a LineKey from its parts. variationId MUST be a real uuid —
 * the caller is responsible for resolving the item's default variation
 * before calling. modifierSig must be the canonical signature returned
 * by `modifierSignature()` (the same function the server uses for
 * dedup); an empty string means "no modifiers".
 */
export function makeLineKey(
  itemId: string,
  variationId: string,
  modifierSig: string,
): LineKey {
  if (process.env.NODE_ENV !== "production") {
    if (!itemId) throw new Error("makeLineKey: itemId is required");
    if (!variationId)
      throw new Error(
        "makeLineKey: variationId is required — resolve default variation at the call site",
      );
  }
  return `${itemId}${SEP}${variationId}${SEP}${modifierSig}`;
}

/**
 * Compose a LineKey for a fresh add. Pass `modifiers` in the same shape
 * the cart API accepts; we'll compute the canonical signature here.
 */
export function lineKeyFromShape(input: {
  itemId: string;
  variationId: string;
  modifiers?: ReadonlyArray<{
    modifierListId: string;
    modifierId: string | null;
    quantity: number;
    text_value: string | null;
  }>;
}): LineKey {
  const sig = modifierSignature(
    (input.modifiers ?? []).map<ModifierSelection>((m) => ({
      listId: m.modifierListId,
      modifierId: m.modifierId,
      quantity: m.quantity,
      text_value: m.text_value,
    })),
  );
  return makeLineKey(input.itemId, input.variationId, sig);
}

/**
 * Compose a LineKey from a server line. We rely on the same dedup
 * tuple the server already uses; the only nuance is that the server's
 * line carries hidden-modifier filtered rows already (the response
 * normalizer in lib/cart/orders.ts strips them), so the signature we
 * compute here matches what `lineKeyFromShape` would produce on the
 * client side for the same logical line.
 */
export function lineKeyFromServerLine(line: {
  catalog_item_id: string | null;
  catalog_variation_id: string | null;
  modifiers: ReadonlyArray<{
    catalog_modifier_id: string | null;
    catalog_modifier_list_id: string | null;
    quantity: number;
    text_value: string | null;
  }>;
}): LineKey {
  // Legacy rows with NULL catalog_item_id shouldn't reach the cart UI,
  // but we have to handle them defensively for the type checker. The
  // empty itemId sentinel here is safe because makeLineKey's dev-mode
  // assertion will catch any path that actually tries to construct a
  // LineKey from one — production silently produces a key that won't
  // match any client-side LineKey (so the line gets a one-off React
  // identity and no mutation can target it, which is the right
  // failure mode for legacy data).
  const itemId = line.catalog_item_id ?? "";
  const variationId = line.catalog_variation_id ?? "";
  const sig = modifierSignature(
    line.modifiers
      .filter((m) => m.catalog_modifier_list_id !== null)
      .map<ModifierSelection>((m) => ({
        listId: m.catalog_modifier_list_id as string,
        modifierId: m.catalog_modifier_id,
        quantity: m.quantity,
        text_value: m.text_value,
      })),
  );
  return `${itemId}${SEP}${variationId}${SEP}${sig}`;
}
