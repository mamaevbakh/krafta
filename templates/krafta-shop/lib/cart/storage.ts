import type { LineSelection } from "./signature";

/**
 * The cart token is a bearer secret minted by the engine (`createCart`) — it's
 * how the cart and its eventual order are scoped to this shopper. We hold it in
 * `localStorage` so the cart survives reloads.
 *
 * Alongside it we persist a small ledger: for every line we've added, the
 * `CartLineInput` selection we sent (keyed by its signature), plus the mapping
 * from each line's signature to the engine's line id. The engine's `Cart` only
 * returns display-shape modifiers, so without this ledger we couldn't re-address
 * a customised line (to change its quantity or remove it) after a reload.
 */

export type CartLedgerEntry = {
  /** `lineSignature(input)` — the stable client key for this configuration. */
  sig: string;
  /** The selection we sent the engine; resent (with a new qty) to mutate it. */
  selection: LineSelection;
};

export type PersistedCart = {
  cartToken: string;
  entries: CartLedgerEntry[];
  /** `[signature, engineLineId]` pairs. Lets a restored cart map the engine's
   *  returned line ids back to the selection that created them. */
  lineIds: Array<[string, string]>;
};

const STORAGE_VERSION = 1;

/** Per-shop key — namespaced by publishable key so two shops served from the
 *  same origin (e.g. local template dev pointed at different keys) don't share
 *  a cart. */
function storageKey(publishableKey: string): string {
  return `krafta.cart.v${STORAGE_VERSION}::${publishableKey}`;
}

export function loadPersistedCart(publishableKey: string): PersistedCart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(publishableKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCart>;
    if (typeof parsed.cartToken !== "string" || !parsed.cartToken) return null;
    return {
      cartToken: parsed.cartToken,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      lineIds: Array.isArray(parsed.lineIds) ? parsed.lineIds : [],
    };
  } catch {
    // Corrupt JSON or storage disabled (private mode) — start fresh.
    return null;
  }
}

export function savePersistedCart(
  publishableKey: string,
  value: PersistedCart,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(publishableKey),
      JSON.stringify(value),
    );
  } catch {
    // Quota exceeded / storage disabled — the cart still works in-memory.
  }
}

export function clearPersistedCart(publishableKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(publishableKey));
  } catch {
    // ignore
  }
}
