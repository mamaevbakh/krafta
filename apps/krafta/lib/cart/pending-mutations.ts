// Persistent mutation queue for the customer cart.
//
// Background: the cart's debounced server sync (default 400ms) opens a small
// window where a tab close can lose the write — the timer never fires, the
// server never hears about the tap. Meanwhile the localStorage snapshot
// shows the items, so the customer thinks they're saved. On reload they
// find their qty reverted; on checkout they place an order against a
// stale draft. That's an enterprise hole no production cart can have.
//
// Pattern: every debounced write is ALSO appended to this queue, keyed by
// the operation's natural key (line id for qty/remove, item-variation-sig
// for adds). When the in-memory debounce timer fires successfully, the
// queue entry is removed. When the tab is reopened, CartProvider drains
// the queue BEFORE the first refresh — so any pending writes from the
// previous session land server-side before we re-read the canonical cart.
//
// Multi-tab: localStorage is shared across tabs of the same origin. If two
// tabs are open and both schedule writes, both append to the same queue.
// That's actually correct — we drain on next mount regardless of which
// tab opened it. The downside is potential duplicate writes if both tabs
// drain on close (rare), which is what Slice C's idempotency keys will
// catch.

import type { ModifierSelection } from "./modifier-signature";

// A pending mutation is what we'll re-dispatch on reload. Keeping these
// shapes close to the action input types (lib/cart/actions.ts) so the
// replay path is a thin switch — no payload reshaping.
export type PendingMutation =
  | {
      id: string;
      type: "add";
      itemId: string;
      variationId?: string;
      quantity: number;
      modifiers: ModifierSelection[];
      /** Coalescing key: itemId::variationId::modifierSig. Two adds with
       *  the same key collapse into one entry (replaces, doesn't append). */
      key: string;
    }
  | {
      id: string;
      type: "update";
      lineItemId: string;
      quantity: number;
    }
  | {
      id: string;
      type: "remove";
      lineItemId: string;
    }
  | {
      id: string;
      type: "clear";
    };

const QUEUE_KEY_PREFIX = "krafta.cart.mutations";

function storageKey(orgId: string, venueId: string): string {
  return `${QUEUE_KEY_PREFIX}.${orgId}.${venueId}`;
}

export function readPendingMutations(
  orgId: string,
  venueId: string,
): PendingMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(orgId, venueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive shape check — older sessions or corrupted state could
    // produce malformed entries; we silently drop them rather than crash
    // the cart on next mount.
    return parsed.filter((m): m is PendingMutation => {
      if (!m || typeof m !== "object" || typeof m.id !== "string") return false;
      return ["add", "update", "remove", "clear"].includes(m.type);
    });
  } catch {
    return [];
  }
}

export function writePendingMutations(
  orgId: string,
  venueId: string,
  queue: PendingMutation[],
): void {
  if (typeof window === "undefined") return;
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(storageKey(orgId, venueId));
      return;
    }
    window.localStorage.setItem(
      storageKey(orgId, venueId),
      JSON.stringify(queue),
    );
  } catch {
    // Quota / private browsing — silently drop. Tab-close protection lost
    // for this session; in-memory debounce still runs as normal.
  }
}

/**
 * Append a new mutation OR replace an existing entry that targets the same
 * resource. Coalescing rules:
 *   - "add" replaces an existing "add" with the same `key` (newer payload
 *      wins — typically a higher quantity or updated modifier picks).
 *   - "update" replaces an existing "update" for the same lineItemId
 *      (latest absolute qty wins).
 *   - "remove" replaces any prior "update" for the same lineItemId
 *      (remove supersedes any pending change).
 *   - "clear" replaces the entire queue (nothing else matters once the
 *     customer is wiping the cart).
 */
export function enqueueMutation(
  queue: PendingMutation[],
  next: PendingMutation,
): PendingMutation[] {
  if (next.type === "clear") return [next];

  if (next.type === "add") {
    const idx = queue.findIndex((m) => m.type === "add" && m.key === next.key);
    if (idx >= 0) {
      const copy = queue.slice();
      copy[idx] = next;
      return copy;
    }
    return [...queue, next];
  }

  if (next.type === "update") {
    const filtered = queue.filter(
      (m) =>
        !(m.type === "update" && m.lineItemId === next.lineItemId),
    );
    return [...filtered, next];
  }

  // remove
  const filtered = queue.filter(
    (m) =>
      !(
        (m.type === "update" || m.type === "remove") &&
        m.lineItemId === next.lineItemId
      ),
  );
  return [...filtered, next];
}

export function removeMutation(
  queue: PendingMutation[],
  id: string,
): PendingMutation[] {
  return queue.filter((m) => m.id !== id);
}

/** Stable UUID for queue entries. Falls back to a non-cryptographic
 *  prefix when crypto.randomUUID isn't available (very old browsers). */
export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
