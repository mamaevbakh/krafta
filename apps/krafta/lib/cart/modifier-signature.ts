// Canonical signature for a set of selected modifiers on a cart line.
// Used in two places: the client-side optimistic cart (cart-provider) to dedup
// local-state line items, and the server addLineItem path to dedup against
// the DB. Both must agree, byte for byte — that's why this is a shared util.

export type ModifierSelection = {
  modifierId: string;
  quantity: number;
};

// Sorts by modifierId ascending, joins as "id:qty,id:qty". Empty set → "".
// Same selections in different add orders produce the same string.
export function modifierSignature(selections: ModifierSelection[]): string {
  if (selections.length === 0) return "";
  return selections
    .filter((s) => s.quantity > 0)
    .map((s) => ({ id: s.modifierId, qty: s.quantity }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s) => `${s.id}:${s.qty}`)
    .join(",");
}
