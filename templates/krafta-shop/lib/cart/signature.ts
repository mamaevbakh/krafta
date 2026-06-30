import type { CartLineInput, ModifierSelection } from "@krafta/commerce";

/**
 * A cart line's identity is the tuple `(itemId, variationId, modifier
 * selection)`. The engine keys its line rows on the same tuple, so two adds of
 * the *same* configuration merge into one line, while a different milk or an
 * extra shot becomes its own line.
 *
 * The public `Cart` the engine returns flattens each line's modifiers to
 * `{ name, priceCents }` for display — it does NOT echo back the selection ids.
 * So the shop can't reconstruct a line's selection from the server response; it
 * has to remember the `CartLineInput` it sent. These helpers compute the stable
 * client-side key we file each remembered input under.
 */

/**
 * Canonical signature for a set of modifier selections. Mirrors the engine's own
 * `modifierSignature` byte-for-byte so the same configuration produces the same
 * key on both sides:
 *   - a chosen modifier  → `m:{modifierId}:1`
 *   - a typed text value → `t:{listId}:{text}`
 * Empty selection → "". Order-independent (sorted), so the key is the same no
 * matter what order the customer picked things in.
 *
 * The public commerce API only carries qty-1 modifier selections (a list lets
 * you pick a modifier or not — there's no "× 3 of one modifier"), so quantity
 * never enters the key.
 */
export function modifierSignature(modifiers: ModifierSelection[]): string {
  const parts: string[] = [];
  for (const sel of modifiers) {
    if (!sel.modifierListId) continue;
    if (typeof sel.text === "string" && sel.text.trim().length > 0) {
      parts.push(`t:${sel.modifierListId}:${sel.text.trim()}`);
    }
    for (const id of sel.modifierIds ?? []) {
      if (id) parts.push(`m:${id}:1`);
    }
  }
  if (parts.length === 0) return "";
  return parts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(",");
}

/** Stable key for a whole cart line: item + variation + modifier signature. */
export function lineSignature(input: {
  itemId: string;
  variationId: string;
  modifiers?: ModifierSelection[];
}): string {
  return `${input.itemId}::${input.variationId}::${modifierSignature(
    input.modifiers ?? [],
  )}`;
}

/** The selection half of a `CartLineInput` — everything except the quantity,
 *  which is the part we resend (as an absolute target) to change a line. */
export type LineSelection = Pick<
  CartLineInput,
  "itemId" | "variationId" | "modifiers"
>;
