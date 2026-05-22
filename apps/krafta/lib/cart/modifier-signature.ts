// Canonical signature for a set of selected modifiers on a cart line.
// Used in two places: the client-side optimistic cart (cart-provider) to dedup
// local-state line items, and the server addLineItem path to dedup against
// the DB. Both must agree, byte for byte — that's why this is a shared util.

export type ModifierSelection = {
  /** The parent modifier_list id. Always set so text-mode rows (which have
   *  no modifierId) can still be routed back to their list on the server. */
  listId: string;
  /** List-mode: the modifier row id. Text-mode: `null` (the customer typed
   *  into the list directly, no modifier row exists). */
  modifierId: string | null;
  quantity: number;
  /** Text-mode only: the customer's typed string (trimmed). `null` for
   *  list-mode rows. Two adds with same item+variation but different
   *  text_value must NOT merge — they're different kitchen instructions. */
  text_value: string | null;
};

// Sorts deterministically, then joins.
//   List-mode rows become "m:{modifierId}:{qty}".
//   Text-mode rows become "t:{listId}:{text_value}".
// The "m:"/"t:" prefix prevents a modifier id from ever colliding with a
// list id that happens to share the same uuid (won't happen for real
// uuids, but the prefix removes the question entirely).
//
// Empty set → "". Same selections in different add orders produce the
// same string.
export function modifierSignature(selections: ModifierSelection[]): string {
  if (selections.length === 0) return "";
  return selections
    .filter((s) => s.quantity > 0)
    .map((s) => {
      if (s.modifierId !== null) {
        return `m:${s.modifierId}:${s.quantity}`;
      }
      // Text-mode row. Include the trimmed value in the key so two adds
      // with different typed text become separate cart lines.
      return `t:${s.listId}:${s.text_value ?? ""}`;
    })
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(",");
}
