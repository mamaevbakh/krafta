"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  addLineItemAction,
  clearCartAction,
  ensureCartIdentityAction,
  getCartSummaryAction,
  placeOrderAction,
  removeLineItemAction,
  updateLineItemQuantityAction,
} from "@/lib/cart/actions";
import type { CartIdentity } from "@/lib/cart/identity";
import type {
  CartLineItem,
  CartLineItemModifier,
  CartSummary,
} from "@/lib/cart/orders";
import {
  modifierSignature,
  type ModifierSelection,
} from "@/lib/cart/modifier-signature";
import {
  enqueueMutation,
  newMutationId,
  readPendingMutations,
  removeMutation,
  writePendingMutations,
  type PendingMutation,
} from "@/lib/cart/pending-mutations";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import type { PublicTax } from "@/lib/catalogs/types";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";

export type CartFulfillmentMode = "dine_in" | "pickup" | "delivery";
export type CartStep = "cart" | "checkout" | "placed";

export type PlacedOrderSnapshot =
  | {
      orderId: string;
      mode: "dine_in";
      fields: { tableLabel: string };
      lineItems: CartLineItem[];
      subtotalCents: number;
      tipCents: number;
    }
  | {
      orderId: string;
      mode: "pickup";
      fields: {
        scheduleType: "asap" | "scheduled";
        pickupAt: string | null;
        recipientName: string | null;
        recipientPhone: string | null;
        note: string | null;
      };
      lineItems: CartLineItem[];
      subtotalCents: number;
      tipCents: number;
    }
  | {
      orderId: string;
      mode: "delivery";
      fields: {
        address: string;
        recipientName: string;
        recipientPhone: string;
        scheduledFor: string | null;
        note: string | null;
      };
      lineItems: CartLineItem[];
      subtotalCents: number;
      tipCents: number;
    };

type CartContextValue = {
  summary: CartSummary;
  itemCount: number;
  isHydrating: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (next: boolean) => void;
  /** Available fulfillment modes for this venue, in display order. */
  modes: CartFulfillmentMode[];
  /**
   * Active taxes + service fees for the catalog (filtered to the v1-supported
   * shape on the server side). Used to render the breakdown above totals on
   * both the cart-list and checkout steps.
   */
  taxes: PublicTax[];
  /**
   * Customer's chosen tip in cents. Updated via setTipCents from the
   * checkout step; sent to the server on placeOrder.
   */
  tipCents: number;
  setTipCents: (next: number) => void;
  /** Current step inside the drawer: cart list, checkout fields, or confirmation. */
  step: CartStep;
  setStep: (next: CartStep) => void;
  /**
   * QR-driven dine-in lock: when a customer scans a table QR with
   * `?mode=dine_in&table=…`, we pin them to dine-in for the rest of the
   * tab session. CheckoutStep hides the pickup/delivery picker and
   * pre-fills the table number; CartListStep shows a small pill.
   *
   * `null` when no QR context is present (free-form pickup/delivery
   * picker behavior).
   */
  dineInLock: { tableLabel: string } | null;
  /** Clear the dine-in lock — exposed for QA / "switch to delivery" flows
   *  we may want later. Not surfaced in v1 UI. */
  clearDineInLock: () => void;
  /**
   * Soft mode hint from `?mode=pickup` or `?mode=delivery` URL params —
   * just biases the initial picker selection in CheckoutStep without
   * hiding the picker (KRA-79/84). dine_in arrives via dineInLock (a
   * hard lock) and never appears here.
   */
  initialModeHint: "pickup" | "delivery" | null;
  /** Order id stamped on the confirmation step after a successful place. */
  placedOrderId: string | null;
  /**
   * Frozen view of the order at the moment the customer hit Place — order
   * id, mode, mode-specific fields, line items, totals. The placed-step
   * renders against this so the live cart can be reset to empty without
   * destroying the confirmation screen's content.
   */
  placedOrder: PlacedOrderSnapshot | null;
  isPlacingOrder: boolean;
  addItem: (input: {
    itemId: string;
    variationId?: string;
    quantity?: number;
    name?: string;
    basePriceCents?: number;
    variationName?: string | null;
    /**
     * Selected modifiers for this add. Optional — items with no modifier
     * lists or items where the customer made no picks send an empty/missing
     * array. Combined with item+variation, this drives cart-line dedup.
     *
     * Shape supports both list-mode and text-mode rows (KRA-96):
     *  - list-mode: modifierListId + modifierId both set, text_value=null
     *  - text-mode: modifierListId set, modifierId=null, text_value=string
     */
    modifiers?: Array<{
      modifierListId: string;
      modifierId: string | null;
      quantity: number;
      name: string;
      basePriceCentsDelta: number;
      text_value: string | null;
    }>;
  }) => Promise<void>;
  updateQuantity: (lineItemId: string, quantity: number) => Promise<void>;
  /**
   * Delta-based qty stepper. Reads the latest line quantity from the live
   * ref (NOT a render-time closure) before computing the next value, so
   * rapid taps don't all compute the same target. Routes to removeItem
   * when the next qty would be <= 0.
   *
   * Prefer this over `updateQuantity(line.id, line.quantity + 1)` in
   * stepper handlers — that pattern has a stale-closure race under
   * tap-burst (two taps in the same render compute the same +1 target
   * → second tap is a no-op locally; "the number won't move" symptom).
   */
  bumpQuantity: (lineItemId: string, delta: number) => void;
  removeItem: (lineItemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Cancel any in-flight debounced syncs and run their pending writes
   * synchronously, awaiting all. Call before checkout submit so the
   * server's view matches local before placing the order.
   */
  flush: () => Promise<void>;
  /**
   * Flush pending writes, then transition the order draft → open with
   * the chosen mode + fields. On success, sets `placedOrderId` and the
   * step flips to 'placed' for the confirmation screen.
   */
  placeOrder: (
    input:
      | { mode: "dine_in"; fields: { tableLabel: string } }
      | {
          mode: "pickup";
          fields: {
            scheduleType: "asap" | "scheduled";
            pickupAt: string | null;
            recipientName: string | null;
            recipientPhone: string | null;
            note: string | null;
          };
        }
      | {
          mode: "delivery";
          fields: {
            address: string;
            recipientName: string;
            recipientPhone: string;
            scheduledFor: string | null;
            note: string | null;
          };
        },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_SUMMARY: CartSummary = {
  orderId: null,
  version: 0,
  lineItems: [],
  subtotalCents: 0,
};

// 400ms of inactivity before pushing to the server. Industry-standard for
// tap-coalescing on stepper buttons — long enough that 5 rapid taps collapse
// into one network call, short enough that a tab-close right after a tap
// almost always wins the race to the server. Was 2500ms originally, which
// widened every reconcile race (qty stomp across lines) and meant tab-close
// during a 2s+ window silently lost the write — local cache showed items,
// server didn't, checkout placed orders against a stale draft.
const SERVER_SYNC_DEBOUNCE_MS = 400;

// ---- local reducer ---------------------------------------------------------

type LocalAction =
  | {
      type: "add";
      itemId: string;
      variationId: string | null;
      quantity: number;
      name: string;
      variationName: string | null;
      basePriceCents: number;
      modifiers: CartLineItemModifier[];
      modifierSig: string;
    }
  | { type: "updateQuantity"; lineItemId: string; quantity: number }
  | { type: "remove"; lineItemId: string }
  | { type: "clear" };

function recomputeSubtotal(lineItems: CartLineItem[]): number {
  return lineItems.reduce((sum, line) => sum + line.total_price_cents, 0);
}

function lineModifierSig(line: CartLineItem): string {
  return modifierSignature(
    line.modifiers
      // Drop rows that have no list_id — those are pre-KRA-96 legacy rows
      // and won't appear on cart lines we just created locally. Including
      // them with listId="" would only matter for pre-existing rows on
      // the server, which dedup is permissive about anyway.
      .filter((m) => m.catalog_modifier_list_id !== null)
      .map((m) => ({
        listId: m.catalog_modifier_list_id as string,
        modifierId: m.catalog_modifier_id,
        quantity: m.quantity,
        text_value: m.text_value,
      })),
  );
}

function perUnitCents(line: { base_price_cents: number; modifiers: CartLineItemModifier[] }): number {
  const delta = line.modifiers.reduce(
    (sum, m) => sum + m.base_price_cents_delta * m.quantity,
    0,
  );
  return line.base_price_cents + delta;
}

function applyLocal(state: CartSummary, action: LocalAction): CartSummary {
  switch (action.type) {
    case "add": {
      // Dedup key: (item, variation, modifier_signature). Two adds with the
      // same item+variation but different modifier picks must NOT merge —
      // they're different orders to the kitchen. Matches server-side
      // resolveModifierSelections + signature logic in lib/cart/orders.ts.
      const matchingIndex = state.lineItems.findIndex(
        (line) =>
          line.catalog_item_id === action.itemId &&
          line.catalog_variation_id === action.variationId &&
          lineModifierSig(line) === action.modifierSig,
      );

      if (matchingIndex >= 0) {
        const next = [...state.lineItems];
        const existing = next[matchingIndex];
        const nextQty = existing.quantity + action.quantity;
        next[matchingIndex] = {
          ...existing,
          quantity: nextQty,
          total_price_cents: perUnitCents(existing) * nextQty,
        };
        return { ...state, lineItems: next, subtotalCents: recomputeSubtotal(next) };
      }

      const placeholder: CartLineItem = {
        id: `local-${
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2)
        }`,
        uid: "",
        catalog_item_id: action.itemId,
        catalog_variation_id: action.variationId,
        name: action.name,
        variation_name: action.variationName,
        quantity: action.quantity,
        base_price_cents: action.basePriceCents,
        total_price_cents:
          perUnitCents({
            base_price_cents: action.basePriceCents,
            modifiers: action.modifiers,
          }) * action.quantity,
        modifiers: action.modifiers,
      };
      const next = [...state.lineItems, placeholder];
      return { ...state, lineItems: next, subtotalCents: recomputeSubtotal(next) };
    }
    case "updateQuantity": {
      if (action.quantity <= 0) {
        const next = state.lineItems.filter((line) => line.id !== action.lineItemId);
        return { ...state, lineItems: next, subtotalCents: recomputeSubtotal(next) };
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
      return { ...state, lineItems: next, subtotalCents: recomputeSubtotal(next) };
    }
    case "remove": {
      const next = state.lineItems.filter((line) => line.id !== action.lineItemId);
      return { ...state, lineItems: next, subtotalCents: recomputeSubtotal(next) };
    }
    case "clear": {
      return { ...state, lineItems: [], subtotalCents: 0 };
    }
  }
}

// ---- debounce + settle reconcile -------------------------------------------
//
// Server sync is debounced per "key" — line id for qty updates,
// (item, variation) for adds. The local state stays authoritative during the
// user's session so the UI is instant.
//
// When a debounced sync resolves AND no new pending timer has been queued
// for that same key in the meantime, we apply the server response to local
// state — that way once the user stops clicking, what they see equals what
// is in the DB. If they DID click again during the round-trip, we skip the
// reconcile (the next debounce will sync the fresher value and reconcile
// then).

type Pending = { timer: ReturnType<typeof setTimeout> };

// Identity key for cart lines (matches server-side dedup logic in
// lib/cart/orders.ts addLineItem). Two lines with the same triple are the
// same logical cart line: a server-real line REPLACES any local placeholder
// with the same triple, instead of appearing alongside it.
//
// Used by reconcileServerSummary to drop local placeholders once the server
// has materialized them as real rows.
function lineIdentityKey(line: CartLineItem): string {
  const sig = modifierSignature(
    line.modifiers
      .filter((m) => m.catalog_modifier_list_id !== null)
      .map((m) => ({
        listId: m.catalog_modifier_list_id as string,
        modifierId: m.catalog_modifier_id,
        quantity: m.quantity,
        text_value: m.text_value,
      })),
  );
  return `${line.catalog_item_id ?? ""}::${line.catalog_variation_id ?? ""}::${sig}`;
}

/**
 * Local-first merge of a server cart response into the local state. Used at
 * every place a server-action call resolves with a fresh CartSummary
 * (addItem timer, updateQuantity timer, removeItem, clear, refresh) — so
 * the local optimistic state is never stomped by a stale-looking server
 * response.
 *
 * Three protections layered:
 *
 *   1. **Fewer lines on server → keep local.** Customer added/edited
 *      something then navigated or refreshed before the debounce fired;
 *      local has their intent, server is behind.
 *
 *   2. **Any line with a pending qty timer keeps local qty.** This is
 *      what prevents action A's response from snapping Line B's qty
 *      back when both A and B were recently tapped — A's response
 *      contains the pre-B-tap quantity for B, but B's debounce hasn't
 *      flushed yet, so the customer's intent for B wins.
 *
 *   3. **Local placeholders survive the round-trip, but get replaced by
 *      same-identity server lines.** A placeholder created by addItem
 *      lives at `id: "local-…"`. When the server materializes it (real
 *      uuid id), the placeholder is dropped via identity match (item +
 *      variation + modifier-sig) and replaced by the server's row.
 *      Without identity matching we'd see the placeholder AND the real
 *      line side-by-side until the next refresh.
 */
function reconcileServerSummary(
  prev: CartSummary,
  next: CartSummary,
  pendingQtyTimers: ReadonlyMap<string, unknown>,
): CartSummary {
  // Guard #1: fewer lines on server → server is behind, keep local.
  if (prev.lineItems.length > next.lineItems.length) return prev;

  // Guard #2: per-line qty preservation for lines with pending timers.
  const prevById = new Map(prev.lineItems.map((l) => [l.id, l]));
  const merged = next.lineItems.map((serverLine) => {
    const localLine = prevById.get(serverLine.id);
    if (
      localLine &&
      pendingQtyTimers.has(serverLine.id) &&
      localLine.quantity !== serverLine.quantity
    ) {
      const perUnit = perUnitCents(localLine);
      return {
        ...serverLine,
        quantity: localLine.quantity,
        total_price_cents: perUnit * localLine.quantity,
      };
    }
    return serverLine;
  });

  // Guard #3: carry over local placeholders the server doesn't already
  // know about (by identity match, not id). Once the server has the real
  // row, we drop the placeholder — otherwise we'd see two rows for the
  // same item until the next refresh.
  const serverIdentityKeys = new Set(next.lineItems.map(lineIdentityKey));
  const placeholders = prev.lineItems.filter(
    (l) => l.id.startsWith("local-") && !serverIdentityKeys.has(lineIdentityKey(l)),
  );

  const lineItems = [...merged, ...placeholders];
  return {
    ...next,
    lineItems,
    subtotalCents: recomputeSubtotal(lineItems),
  };
}

// ----------------------------------------------------------------------------

type CartProviderProps = {
  orgId: string;
  venueId: string;
  catalogPath: string;
  /** Filtered, in-display-order list of modes the venue offers. */
  modes: CartFulfillmentMode[];
  /**
   * Active catalog taxes/service fees, fetched at the page level so the
   * cart drawer + checkout breakdown render without a roundtrip. Empty
   * array is fine: pricing util short-circuits with no fee lines.
   */
  taxes?: PublicTax[];
  initialSummary?: CartSummary;
  children: ReactNode;
};

// ──────────────────────────────────────────────────────────────────────────
// Local-first cart cache (instant first-paint, no hydration flash).
//
// The cart's source of truth for the UI is the local React state. The DB
// is a silent telemetry + crash-recovery channel that gets a debounced
// background sync. On reload, we read the localStorage snapshot
// synchronously so the first paint already shows the right stepper /
// quantity / line items — no "loading" flash, no "Add to cart" flicker
// that then morphs into a stepper a second later.
//
// Keyed per (orgId, venueId) so two venues in the same browser don't
// cross-contaminate. Quota / private-browsing failures are non-fatal —
// we just lose the instant-paint optimization for that session.
// ──────────────────────────────────────────────────────────────────────────
const CART_CACHE_PREFIX = "krafta.cart.summary";

function cartCacheKey(orgId: string, venueId: string): string {
  return `${CART_CACHE_PREFIX}.${orgId}.${venueId}`;
}

function readCachedSummary(
  orgId: string,
  venueId: string,
): CartSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cartCacheKey(orgId, venueId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartSummary;
    // Defensive: ensure required fields are present + sane shape.
    if (
      parsed &&
      typeof parsed.subtotalCents === "number" &&
      Array.isArray(parsed.lineItems)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedSummary(
  orgId: string,
  venueId: string,
  summary: CartSummary,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cartCacheKey(orgId, venueId),
      JSON.stringify(summary),
    );
  } catch {
    // Quota / private browsing — silently drop. In-memory state still works.
  }
}

export function CartProvider({
  orgId,
  venueId,
  catalogPath,
  modes,
  taxes = [],
  initialSummary,
  children,
}: CartProviderProps) {
  // SSR-safe init: both server and client start with the SAME state
  // (initialSummary if passed, otherwise EMPTY_SUMMARY). Reading
  // localStorage here would diverge server vs client and trigger a
  // hydration mismatch warning + force React to re-render the whole
  // tree. The localStorage snapshot is applied post-mount via an
  // effect (see below) — close enough to "instant" for the customer
  // (one frame later) while staying SSR-correct.
  const [summary, setSummaryRaw] = useState<CartSummary>(
    initialSummary ?? EMPTY_SUMMARY,
  );

  // summaryRef mirrors `summary` state but updates SYNCHRONOUSLY inside
  // setSummary (not via a useEffect, which lags by one render). Callers
  // that need "what is local right now?" — bumpQuantity reading the latest
  // qty before scheduling an absolute update, updateQuantity finding a
  // local placeholder's pending-add key, flush() draining current state —
  // read summaryRef.current and never see a stale closure.
  const summaryRef = useRef<CartSummary>(
    initialSummary ?? EMPTY_SUMMARY,
  );

  // Persist every cart mutation to localStorage so the next reload paints
  // instantly. Wrapper around setSummary keeps the persistence concern
  // out of every call site (there are ~6 of them across this file).
  //
  // Also updates summaryRef inside the same reducer tick so concurrent
  // synchronous reads (e.g. tap-burst against bumpQuantity) see the latest
  // intent, not a render-stale snapshot. Safe to mutate a ref inside a
  // reducer: refs are not part of React's reconciler state.
  const setSummary: Dispatch<SetStateAction<CartSummary>> = useCallback(
    (next) => {
      setSummaryRaw((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        summaryRef.current = resolved;
        writeCachedSummary(orgId, venueId, resolved);
        return resolved;
      });
    },
    [orgId, venueId],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(!initialSummary);

  // Post-mount: apply the localStorage cache (if any) immediately so the
  // stepper/quantity reflects the customer's previous session state
  // before the server roundtrip lands. This runs ONCE per (org, venue),
  // synchronously inside the effect — by the time the browser paints
  // the first commit's DOM, the localStorage state is also in.
  const hasAppliedCacheRef = useRef(false);
  useEffect(() => {
    if (hasAppliedCacheRef.current) return;
    if (initialSummary) {
      hasAppliedCacheRef.current = true;
      return;
    }
    const cached = readCachedSummary(orgId, venueId);
    if (cached && cached.lineItems.length > 0) {
      setSummaryRaw(cached);
    }
    hasAppliedCacheRef.current = true;
    // setSummaryRaw is stable; orgId+venueId stable per provider mount.
  }, [initialSummary, orgId, venueId]);
  const [step, setStep] = useState<CartStep>("cart");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrderSnapshot | null>(
    null,
  );
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [tipCents, setTipCents] = useState<number>(0);
  const [dineInLock, setDineInLock] = useState<{ tableLabel: string } | null>(
    null,
  );
  const [initialModeHint, setInitialModeHint] = useState<
    "pickup" | "delivery" | null
  >(null);

  // QR-driven dine-in lock hydration.
  //
  // Source of truth chain (highest → lowest priority):
  //   1. ?qr=<shortcode> — "fresh QR scan" signal set by /q/[code]
  //      redirects. URL state becomes AUTHORITATIVE: re-scanning a
  //      different mode QR clears any stale lock from a prior scan.
  //      Scanning the main QR (no mode/table params) resets to the free
  //      picker. After consumption we strip ?qr= (and the mode/table
  //      params that came with it) via history.replaceState so a refresh
  //      doesn't re-trigger the reset and the address bar stays clean.
  //   2. ?mode=… without ?qr= — shared/typed URL with explicit intent
  //      (someone sent a friend a pickup link). Adopt the mode but
  //      DON'T strip — keep the URL shareable.
  //   3. sessionStorage for this venue (keyed per-venueId so two venues
  //      open in the same tab don't cross-contaminate). Persists across
  //      in-app navigation + refresh so customers don't lose their table
  //      lock by tapping around.
  //   4. null — free-form mode picker.
  const searchParams = useSearchParams();
  const storageKey = `krafta.cart.dineIn.${venueId}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qrParam = searchParams?.get("qr");
    const modeParam = searchParams?.get("mode");
    const tableParam = searchParams?.get("table");
    const hasFreshScan = Boolean(qrParam);
    const hasModeIntent =
      modeParam === "dine_in" ||
      modeParam === "pickup" ||
      modeParam === "delivery";

    if (hasFreshScan || hasModeIntent) {
      // URL carries explicit intent. Apply it to in-memory state +
      // sessionStorage. The mode/table inversions below cover all four
      // QR kinds (main / table / pickup / delivery) plus the shared-link
      // cases.
      if (
        modeParam === "dine_in" &&
        tableParam &&
        tableParam.trim().length > 0
      ) {
        const next = { tableLabel: tableParam.trim() };
        setDineInLock(next);
        setInitialModeHint(null);
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Quota / private browsing — non-fatal; in-memory lock still works.
        }
      } else if (modeParam === "pickup" || modeParam === "delivery") {
        // Switching to non-dine_in: clear any prior table lock so the
        // customer actually lands in the new mode instead of staying
        // pinned to the table they scanned earlier.
        setDineInLock(null);
        setInitialModeHint(modeParam);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      } else if (hasFreshScan) {
        // Fresh scan with no mode/table = main QR. Reset everything so
        // the customer sees the unbiased picker.
        setDineInLock(null);
        setInitialModeHint(null);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      }

      // ?qr= is a one-shot signal — strip it (plus the mode/table that
      // came with it) so a page refresh doesn't re-fire this branch and
      // wipe a lock the customer may have set via the picker after the
      // initial scan. We only strip when ?qr= is present; shared/typed
      // URLs without ?qr= keep their params intact for shareability.
      if (hasFreshScan) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("qr");
          url.searchParams.delete("mode");
          url.searchParams.delete("table");
          window.history.replaceState(
            null,
            "",
            url.pathname + (url.search ? url.search : "") + url.hash,
          );
        } catch {
          // ignore — URL mutation is cosmetic, behavior is already correct.
        }
      }
      return;
    }

    // No URL signal — hydrate from sessionStorage if present. This is
    // what preserves the lock across in-app navigation + refresh.
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { tableLabel?: unknown };
        if (typeof parsed.tableLabel === "string" && parsed.tableLabel) {
          setDineInLock({ tableLabel: parsed.tableLabel });
        }
      }
    } catch {
      // Corrupted storage — ignore, fall back to no lock.
    }
    // venueId is captured via storageKey; searchParams is stable per render
    // pair so this re-checks if the user navigates with a new ?qr=/?mode= URL.
  }, [searchParams, storageKey]);

  const clearDineInLock = useCallback(() => {
    setDineInLock(null);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  const { activeLocale, defaultLocale } = useStorefrontLocale();
  // Stash translator in a ref so the memoized server-action callbacks below
  // don't need it in their dep arrays — toast bodies just read the latest.
  const tRef = useRef<(key: StorefrontMessageKey) => string>(() => "");
  tRef.current = (key: StorefrontMessageKey) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });

  // Reset tip when the cart empties to zero — prevents a leftover tip from a
  // previous order applying to a fresh cart the customer just started.
  useEffect(() => {
    if (summary.lineItems.length === 0) setTipCents(0);
  }, [summary.lineItems.length]);

  const pendingQtyTimers = useRef(new Map<string, Pending>());
  const pendingAddTimers = useRef(new Map<string, Pending>());
  const pendingAddTotals = useRef(new Map<string, number>());
  // Modifier selections we'll send when the debounced add fires. Identical
  // signatures imply identical selections — same key in this map always maps
  // to the same payload. We just need somewhere to stash it across timer
  // closures so the fire-time action call can include it.
  const pendingAddModifiers = useRef(new Map<string, ModifierSelection[]>());

  // Identity cache. Bootstrapped once on mount (parallel with the cart
  // summary fetch) and reused on every mutation. Threads the resolved
  // (customerId, userId) pair into addLineItem/updateLineItem/removeLineItem
  // /clearCart so the server skips one auth.getUser() + customers SELECT
  // round-trip per call — saving ~200-400ms per mutation on dev.
  //
  // Trust model: even if a client forged a CartIdentity, RLS policies on
  // commerce.* tables scope every read/write to auth.uid(), so the worst
  // case is a no-op. The hint is a performance optimization, not privilege.
  //
  // Hydrogen does the equivalent via the cart=<id> cookie; we mirror the
  // pattern in-app (sourced from a single anon-auth bootstrap rather than
  // a long-lived cookie because our cart is multi-org and the customerId
  // is per-org). See research notes for the Hydrogen / Linear lineage.
  const identityRef = useRef<CartIdentity | null>(null);

  // orderIdRef removed: summaryRef.current.orderId is now the single source
  // of truth (kept in lockstep with state via setSummary). Callers read
  // it directly inside debounced timers; no separate ref to keep in sync.

  // Persistent mutation queue (Enterprise Slice B). Every debounced server
  // write is ALSO mirrored into localStorage via this queue; on the next
  // mount we drain the queue BEFORE the initial refresh so a tab close
  // during a 400ms debounce window doesn't lose the write.
  //
  // The ref is the in-memory mirror of what's in localStorage. Both stay
  // in lockstep via enqueueMutationLocal / dequeueMutationLocal — never
  // write to one without the other.
  const mutationQueueRef = useRef<PendingMutation[]>([]);

  const enqueueMutationLocal = useCallback(
    (mutation: PendingMutation) => {
      const next = enqueueMutation(mutationQueueRef.current, mutation);
      mutationQueueRef.current = next;
      writePendingMutations(orgId, venueId, next);
    },
    [orgId, venueId],
  );

  const dequeueMutationLocal = useCallback(
    (id: string) => {
      const next = removeMutation(mutationQueueRef.current, id);
      mutationQueueRef.current = next;
      writePendingMutations(orgId, venueId, next);
    },
    [orgId, venueId],
  );

  // Closing the drawer should reset the step so the next open starts at the
  // cart list, not lingering on a stale confirmation.
  useEffect(() => {
    if (!isOpen && step === "placed") {
      setStep("cart");
      setPlacedOrderId(null);
      setPlacedOrder(null);
    }
  }, [isOpen, step]);

  const refresh = useCallback(async () => {
    try {
      const next = await getCartSummaryAction({
        orgId,
        venueId,
        identity: identityRef.current ?? undefined,
        // No orderId hint on the blanket refresh — we want the slow path
        // (re-resolve current draft) in case the customer cleared cookies
        // or a different draft was promoted to open in another tab.
      });
      setSummary((prev) =>
        reconcileServerSummary(prev, next, pendingQtyTimers.current),
      );
    } finally {
      setIsHydrating(false);
    }
  }, [orgId, setSummary, venueId]);

  // Guard against StrictMode double-mount (Next 16 dev default). Without
  // this, the hydration effect fires twice on initial page load — two
  // getCartSummary POSTs back-to-back, AND the second mount resets the
  // provider's React state, wiping any optimistic line the customer
  // just added and making the +/- stepper visually disappear.
  //
  // We track which (org, venue) we last hydrated for. The ref persists
  // across the StrictMode mount-unmount-mount cycle (refs are not reset
  // by React strict-mode remounts the way state is); the comparison
  // prevents a duplicate refresh. If the venue genuinely changes
  // (e.g. customer navigates to a different catalog with the same
  // provider instance), the key changes and we re-hydrate.
  //
  // Identity bootstrap fires in parallel with refresh — they're independent
  // server calls. Once identity resolves, every subsequent mutation skips
  // the ensureCartIdentity round-trip on the server. The first 1-2
  // mutations after page load may race the bootstrap (no hint available
  // yet) — that's fine, the server falls back to ensureCartIdentity as
  // before. Steady state is hint-on-every-call.
  //
  // Mutation queue replay (Slice B): if the previous session left any
  // pending writes in localStorage (tab closed mid-debounce), drain them
  // BEFORE the initial refresh — otherwise the refresh would return the
  // server's pre-pending-writes state and clobber the customer's intent.
  // Replay is awaited on the bootstrap path so refresh() sees the post-
  // replay canonical cart.
  const lastHydratedKey = useRef<string | null>(null);
  useEffect(() => {
    if (initialSummary) {
      setIsHydrating(false);
      // Even with initialSummary we still want identity cached for future
      // mutations. Fire-and-forget; the ref is read on the hot path.
      if (!identityRef.current) {
        ensureCartIdentityAction(orgId)
          .then((id) => {
            identityRef.current = id;
          })
          .catch(() => {
            // Silent — mutations will fall back to server-side ensureCartIdentity.
          });
      }
      return;
    }
    const key = `${orgId}::${venueId}`;
    if (lastHydratedKey.current === key) return;
    lastHydratedKey.current = key;

    // Parallel: cart summary fetch + identity bootstrap. Don't await
    // identity here — refresh() is the path that controls isHydrating;
    // identity is a pure latency optimization for future mutations.
    if (!identityRef.current) {
      ensureCartIdentityAction(orgId)
        .then((id) => {
          identityRef.current = id;
        })
        .catch(() => {
          // Silent fallback to server-side resolve on each mutation.
        });
    }

    // Load persisted queue + drain before first refresh. Sequential
    // dispatch (Promise.allSettled in a for-loop) so a single failure
    // doesn't block the others — each entry is independent. After
    // replay, the queue is cleared regardless of per-entry outcome:
    // the next refresh() is the canonical source of truth and any
    // entries that failed have already shown an error toast.
    const persisted = readPendingMutations(orgId, venueId);
    mutationQueueRef.current = persisted;

    const drainAndRefresh = async () => {
      if (persisted.length > 0) {
        const identity = identityRef.current ?? undefined;
        const orderIdHint = summaryRef.current.orderId ?? undefined;
        const dispatches = persisted.map((mut) => {
          if (mut.type === "add") {
            return addLineItemAction({
              orgId,
              venueId,
              itemId: mut.itemId,
              variationId: mut.variationId,
              quantity: mut.quantity,
              modifiers: mut.modifiers,
              catalogPath,
              identity,
            });
          }
          if (mut.type === "update") {
            return updateLineItemQuantityAction({
              orgId,
              venueId,
              lineItemId: mut.lineItemId,
              quantity: mut.quantity,
              catalogPath,
              identity,
              orderId: orderIdHint,
            });
          }
          if (mut.type === "remove") {
            return removeLineItemAction({
              orgId,
              venueId,
              lineItemId: mut.lineItemId,
              catalogPath,
              identity,
              orderId: orderIdHint,
            });
          }
          return clearCartAction({
            orgId,
            venueId,
            catalogPath,
            identity,
            orderId: orderIdHint,
          });
        });
        await Promise.allSettled(dispatches);
        // Queue is fully drained — wipe it before refresh, regardless of
        // per-entry success. Refresh is canonical from here on.
        mutationQueueRef.current = [];
        writePendingMutations(orgId, venueId, []);
      }
      refresh();
    };

    void drainAndRefresh();
  }, [catalogPath, initialSummary, refresh, orgId, venueId]);

  const cancelPendingForLine = useCallback((lineItemId: string) => {
    const pending = pendingQtyTimers.current.get(lineItemId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingQtyTimers.current.delete(lineItemId);
    }
  }, []);

  const cancelAllPending = useCallback(() => {
    pendingQtyTimers.current.forEach((p) => clearTimeout(p.timer));
    pendingQtyTimers.current.clear();
    pendingAddTimers.current.forEach((p) => clearTimeout(p.timer));
    pendingAddTimers.current.clear();
    pendingAddTotals.current.clear();
    pendingAddModifiers.current.clear();
  }, []);

  const addItem: CartContextValue["addItem"] = useCallback(
    async ({
      itemId,
      variationId,
      quantity = 1,
      name,
      basePriceCents = 0,
      variationName = null,
      modifiers: inputModifiers,
    }) => {
      // Localized placeholder for the optimistic line label while the server
      // round-trip is in flight. Callers normally pass `name` explicitly.
      const resolvedName = name ?? tRef.current("add_to_cart.adding");
      const modifierSelections: ModifierSelection[] = (inputModifiers ?? []).map(
        (m) => ({
          listId: m.modifierListId,
          modifierId: m.modifierId,
          quantity: m.quantity,
          text_value: m.text_value,
        }),
      );
      const lineModifiers: CartLineItemModifier[] = (inputModifiers ?? []).map(
        (m, index) => ({
          // Local ids are arbitrary — Set the kind (m/t) + something
          // unique-ish so React keys don't collide between list-mode and
          // text-mode rows on the same line. Server reconcile will replace
          // these with real DB ids.
          id:
            m.modifierId !== null
              ? `local-mod-${m.modifierId}`
              : `local-mod-text-${m.modifierListId}-${index}`,
          catalog_modifier_id: m.modifierId,
          catalog_modifier_list_id: m.modifierListId,
          name: m.name,
          base_price_cents_delta: m.basePriceCentsDelta,
          quantity: m.quantity,
          text_value: m.text_value,
        }),
      );
      const sig = modifierSignature(modifierSelections);

      setSummary((prev) =>
        applyLocal(prev, {
          type: "add",
          itemId,
          variationId: variationId ?? null,
          quantity,
          name: resolvedName,
          variationName,
          basePriceCents,
          modifiers: lineModifiers,
          modifierSig: sig,
        }),
      );

      // Debounce key includes the modifier signature so two adds of the
      // same item+variation with different modifier picks debounce
      // separately (and become separate cart lines on the server).
      const key = `${itemId}::${variationId ?? ""}::${sig}`;
      pendingAddTotals.current.set(
        key,
        (pendingAddTotals.current.get(key) ?? 0) + quantity,
      );
      pendingAddModifiers.current.set(key, modifierSelections);

      const existing = pendingAddTimers.current.get(key);
      if (existing) clearTimeout(existing.timer);

      // Mirror the pending add into the persistent queue. enqueueMutation
      // coalesces by `key` — rapid + taps replace the entry with the new
      // accumulated qty, never appending duplicates. On tab close mid-
      // debounce, the next mount drains this and dispatches the add.
      const mutationId = newMutationId();
      enqueueMutationLocal({
        id: mutationId,
        type: "add",
        itemId,
        variationId,
        quantity: pendingAddTotals.current.get(key) ?? quantity,
        modifiers: modifierSelections,
        key,
      });

      const timer = setTimeout(async () => {
        pendingAddTimers.current.delete(key);
        const finalQty = pendingAddTotals.current.get(key) ?? quantity;
        const finalMods = pendingAddModifiers.current.get(key) ?? [];
        pendingAddTotals.current.delete(key);
        pendingAddModifiers.current.delete(key);

        // Cancelled mid-flight (placeholder dropped to 0 in the drawer
        // before the debounce fired). Skip the server call — there's
        // nothing to add. The local cart already reflects qty=0 / removed.
        // Also drop the queue entry: there's no write to recover.
        if (finalQty <= 0) {
          dequeueMutationLocal(mutationId);
          return;
        }

        try {
          const next = await addLineItemAction({
            orgId,
            venueId,
            itemId,
            variationId,
            quantity: finalQty,
            modifiers: finalMods,
            catalogPath,
            identity: identityRef.current ?? undefined,
          });
          // Server applied the write — drop the queue entry. Recovery is
          // no longer needed (canonical state is now in the server cart).
          dequeueMutationLocal(mutationId);
          // Reconcile only if the user has not started a new add for this
          // (item, variation) during the round-trip. If they have, the next
          // debounced sync will reconcile. Use the shared reconcile helper
          // so unrelated lines with pending qty timers aren't stomped by
          // this response.
          if (!pendingAddTimers.current.has(key)) {
            setSummary((prev) =>
              reconcileServerSummary(prev, next, pendingQtyTimers.current),
            );
          }
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : tRef.current("errors.cart_save_failed"),
          );
          refresh();
        }
      }, SERVER_SYNC_DEBOUNCE_MS);

      pendingAddTimers.current.set(key, { timer });
    },
    [
      catalogPath,
      dequeueMutationLocal,
      enqueueMutationLocal,
      orgId,
      refresh,
      setSummary,
      venueId,
    ],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    async (lineItemId, quantity) => {
      setSummary((prev) =>
        applyLocal(prev, { type: "updateQuantity", lineItemId, quantity }),
      );

      // Local-only placeholders have no server-side row yet — the +/- in
      // the drawer is operating on a line that's still waiting for its
      // debounced add to fire. We can't issue an updateLineItemQuantity
      // RPC (no real line id), so we mirror the customer's absolute target
      // qty into pendingAddTotals so the pending add sends the right
      // number when its timer fires. Without this the add fires with the
      // original qty (typically 1) and the customer's edit silently
      // disappears when the server response arrives.
      //
      // qty=0 leaves pendingAddTotals at 0; the add timer's `if (finalQty
      // <= 0) return` guard then skips the server call entirely — the
      // placeholder was effectively cancelled before it ever materialized.
      if (lineItemId.startsWith("local-")) {
        const localLine = summaryRef.current.lineItems.find(
          (l) => l.id === lineItemId,
        );
        if (localLine && localLine.catalog_item_id) {
          const key = lineIdentityKey(localLine);
          if (pendingAddTotals.current.has(key)) {
            pendingAddTotals.current.set(key, quantity);
          }
        }
        return;
      }

      const existing = pendingQtyTimers.current.get(lineItemId);
      if (existing) clearTimeout(existing.timer);

      // Mirror pending qty update into the persistent queue. Coalesces by
      // lineItemId — rapid +/- on the same line collapse to one entry
      // with the latest absolute qty.
      const mutationId = newMutationId();
      enqueueMutationLocal({
        id: mutationId,
        type: "update",
        lineItemId,
        quantity,
      });

      const timer = setTimeout(async () => {
        pendingQtyTimers.current.delete(lineItemId);
        try {
          const next = await updateLineItemQuantityAction({
            orgId,
            venueId,
            lineItemId,
            quantity,
            catalogPath,
            identity: identityRef.current ?? undefined,
            orderId: summaryRef.current.orderId ?? undefined,
          });
          dequeueMutationLocal(mutationId);
          // Reconcile only if the user has not clicked +/- on this line
          // during the round-trip. The next debounce will handle that case.
          // Use the shared reconcile helper so OTHER lines with their own
          // pending qty timers aren't stomped by this response — that was
          // the "tap A, then tap B, see B snap back" bug.
          if (!pendingQtyTimers.current.has(lineItemId)) {
            setSummary((prev) =>
              reconcileServerSummary(prev, next, pendingQtyTimers.current),
            );
          }
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : tRef.current("errors.cart_save_failed"),
          );
          refresh();
        }
      }, SERVER_SYNC_DEBOUNCE_MS);

      pendingQtyTimers.current.set(lineItemId, { timer });
    },
    [
      catalogPath,
      dequeueMutationLocal,
      enqueueMutationLocal,
      orgId,
      refresh,
      setSummary,
      venueId,
    ],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    async (lineItemId) => {
      setSummary((prev) => applyLocal(prev, { type: "remove", lineItemId }));
      cancelPendingForLine(lineItemId);

      if (lineItemId.startsWith("local-")) return;

      // Remove fires immediately (no debounce), but enqueue it anyway so
      // a tab close mid-flight can recover. Remove supersedes any prior
      // queued update for the same lineItemId — see enqueueMutation.
      const mutationId = newMutationId();
      enqueueMutationLocal({
        id: mutationId,
        type: "remove",
        lineItemId,
      });

      try {
        const next = await removeLineItemAction({
          orgId,
          venueId,
          lineItemId,
          catalogPath,
          identity: identityRef.current ?? undefined,
          orderId: summaryRef.current.orderId ?? undefined,
        });
        dequeueMutationLocal(mutationId);
        setSummary((prev) =>
          reconcileServerSummary(prev, next, pendingQtyTimers.current),
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : tRef.current("errors.cart_save_failed"),
        );
        refresh();
      }
    },
    [
      cancelPendingForLine,
      catalogPath,
      dequeueMutationLocal,
      enqueueMutationLocal,
      orgId,
      refresh,
      setSummary,
      venueId,
    ],
  );

  const bumpQuantity: CartContextValue["bumpQuantity"] = useCallback(
    (lineItemId, delta) => {
      // Read latest from summaryRef (live, lockstep with state) instead of
      // a closure-captured `line.quantity` — otherwise two taps within the
      // same render frame both compute the same absolute target and the
      // second tap is a no-op locally ("the number won't move" symptom).
      const line = summaryRef.current.lineItems.find(
        (l) => l.id === lineItemId,
      );
      if (!line) return;
      const next = line.quantity + delta;
      if (next <= 0) {
        void removeItem(lineItemId);
      } else {
        void updateQuantity(lineItemId, next);
      }
    },
    [removeItem, updateQuantity],
  );

  const clear: CartContextValue["clear"] = useCallback(async () => {
    setSummary((prev) => applyLocal(prev, { type: "clear" }));
    cancelAllPending();

    // Clear supersedes the entire queue (see enqueueMutation: type=clear
    // replaces all). One queued clear is enough to recover any prior state.
    const mutationId = newMutationId();
    enqueueMutationLocal({ id: mutationId, type: "clear" });

    try {
      const next = await clearCartAction({
        orgId,
        venueId,
        catalogPath,
        identity: identityRef.current ?? undefined,
        orderId: summaryRef.current.orderId ?? undefined,
      });
      dequeueMutationLocal(mutationId);
      setSummary((prev) =>
        reconcileServerSummary(prev, next, pendingQtyTimers.current),
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : tRef.current("errors.cart_save_failed"),
      );
      refresh();
    }
  }, [
    cancelAllPending,
    catalogPath,
    dequeueMutationLocal,
    enqueueMutationLocal,
    orgId,
    refresh,
    setSummary,
    venueId,
  ]);

  // Fire pending debounced writes immediately. Used before checkout to make
  // sure the server has the latest cart contents before we transition the
  // order from draft to open.
  const flush: CartContextValue["flush"] = useCallback(async () => {
    const pendingPromises: Promise<unknown>[] = [];
    const identity = identityRef.current ?? undefined;
    const orderId = summaryRef.current.orderId ?? undefined;

    // Fire pending qty updates immediately. Each line carries the absolute
    // target quantity from local state.
    for (const [lineItemId, pending] of pendingQtyTimers.current.entries()) {
      clearTimeout(pending.timer);
      const localLine = summary.lineItems.find((line) => line.id === lineItemId);
      const quantity = localLine?.quantity ?? 0;
      pendingPromises.push(
        updateLineItemQuantityAction({
          orgId,
          venueId,
          lineItemId,
          quantity,
          catalogPath,
          identity,
          orderId,
        }),
      );
    }
    pendingQtyTimers.current.clear();

    // Fire pending adds immediately with the accumulated quantity. Key format
    // is `itemId::variationId::modifierSig`; signatures can be empty (no
    // modifiers) but the segment count stays at 3.
    for (const [key, pending] of pendingAddTimers.current.entries()) {
      clearTimeout(pending.timer);
      const [itemId, variationId] = key.split("::");
      const accumQty = pendingAddTotals.current.get(key) ?? 1;
      const mods = pendingAddModifiers.current.get(key) ?? [];
      pendingPromises.push(
        addLineItemAction({
          orgId,
          venueId,
          itemId,
          variationId: variationId || undefined,
          quantity: accumQty,
          modifiers: mods,
          catalogPath,
          identity,
        }),
      );
    }
    pendingAddTimers.current.clear();
    pendingAddTotals.current.clear();
    pendingAddModifiers.current.clear();

    if (pendingPromises.length === 0) return;
    await Promise.allSettled(pendingPromises);
  }, [catalogPath, orgId, summary.lineItems, venueId]);

  // Synchronous double-tap guard. setIsPlacingOrder(true) is async — a
  // user double-tapping faster than React schedules the re-render could
  // sneak in a second submission. The ref makes the rejection synchronous.
  const placeInFlightRef = useRef(false);

  const placeOrder: CartContextValue["placeOrder"] = useCallback(
    async (input) => {
      if (placeInFlightRef.current) {
        return { ok: false, error: "already_placing" } as const;
      }
      placeInFlightRef.current = true;
      setIsPlacingOrder(true);
      try {
        await flush();
        const result = await placeOrderAction({
          orgId,
          venueId,
          catalogPath,
          tipCents,
          ...input,
        } as Parameters<typeof placeOrderAction>[0]);

        // Snapshot the cart at place-time so the confirmation step can
        // render line items + totals after the local cart is cleared.
        // tipCents is included so SummaryBlock can echo the customer's
        // chosen tip on the placed step (they just agreed to it; seeing
        // it confirmed builds trust before the merchant collects cash).
        const snapshotBase = {
          orderId: result.orderId,
          lineItems: summary.lineItems,
          subtotalCents: summary.subtotalCents,
          tipCents,
        };
        const snapshot: PlacedOrderSnapshot =
          input.mode === "dine_in"
            ? { ...snapshotBase, mode: "dine_in", fields: input.fields }
            : input.mode === "pickup"
              ? { ...snapshotBase, mode: "pickup", fields: input.fields }
              : { ...snapshotBase, mode: "delivery", fields: input.fields };

        setPlacedOrder(snapshot);
        setPlacedOrderId(result.orderId);
        setStep("placed");
        // Empty the local cart now that the order is in state='open'. The
        // server has already created the new fulfillment; the existing
        // draft order is gone.
        setSummary(EMPTY_SUMMARY);
        return { ok: true } as const;
      } catch (err) {
        // Map server-thrown machine codes to localized copy so the toast
        // body matches the customer's storefront locale rather than
        // surfacing the raw `tip_too_high` key.
        const rawMessage =
          err instanceof Error ? err.message : null;
        const knownCodes: Record<string, StorefrontMessageKey> = {
          tip_too_high: "errors.tip_too_high",
          tip_without_items: "errors.tip_without_items",
          phone_invalid: "errors.phone_invalid",
          cart_empty: "errors.cart_empty",
          scheduled_time_too_soon: "errors.scheduled_time_too_soon",
          order_expired: "errors.order_expired",
          table_session_expired: "errors.table_session_expired",
        };
        // Price-drift (S11). The server throws "price_changed:Name1, Name2"
        // when any line item's snapshotted base_price_cents diverges from
        // the live catalog variation price. We refresh() the cart so the
        // customer sees the updated prices in the cart list when they
        // close the toast, then they re-attempt.
        let message: string;
        if (rawMessage && rawMessage.startsWith("price_changed")) {
          // errors.price_changed expects {name}, {old}, {new}. We only
          // have the affected names from the server (cheap to compute);
          // a richer payload could include old/new cents at the cost
          // of more server round-trips. For v1 we use the name list
          // and let the customer re-check the cart row's updated price.
          const names =
            rawMessage.split(":")[1]?.trim() || "";
          message = tRef.current("errors.price_changed").replace(
            /\{name\}/g,
            names,
          );
          // Fire-and-forget: the catch returns immediately; refresh
          // hydrates new prices in the background so the cart row's
          // total reflects reality next time the customer looks.
          refresh().catch(() => {
            /* noop — refresh's own catch surfaces a toast if needed */
          });
        } else if (rawMessage && rawMessage in knownCodes) {
          message = tRef.current(knownCodes[rawMessage]!);
        } else {
          message = rawMessage ?? tRef.current("errors.place_order_failed");
        }
        toast.error(message);
        return { ok: false, error: message } as const;
      } finally {
        setIsPlacingOrder(false);
        placeInFlightRef.current = false;
      }
    },
    [
      catalogPath,
      flush,
      orgId,
      refresh,
      summary.lineItems,
      summary.subtotalCents,
      tipCents,
      venueId,
    ],
  );

  const itemCount = summary.lineItems.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  const value = useMemo<CartContextValue>(
    () => ({
      summary,
      itemCount,
      isHydrating,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      setOpen: setIsOpen,
      modes,
      taxes,
      tipCents,
      setTipCents,
      step,
      setStep,
      dineInLock,
      clearDineInLock,
      initialModeHint,
      placedOrderId,
      placedOrder,
      isPlacingOrder,
      addItem,
      updateQuantity,
      bumpQuantity,
      removeItem,
      clear,
      refresh,
      flush,
      placeOrder,
    }),
    [
      addItem,
      bumpQuantity,
      clear,
      clearDineInLock,
      dineInLock,
      flush,
      initialModeHint,
      isHydrating,
      isOpen,
      isPlacingOrder,
      itemCount,
      modes,
      placeOrder,
      placedOrder,
      placedOrderId,
      refresh,
      removeItem,
      step,
      summary,
      taxes,
      tipCents,
      updateQuantity,
    ],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = use(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>.");
  }
  return ctx;
}

/**
 * Returns the cart context if available, or null. Use when a component
 * renders both inside and outside a cart-enabled tree (e.g. item detail
 * renders Add-to-cart when cart is enabled, plain Close otherwise).
 */
export function useOptionalCart(): CartContextValue | null {
  return use(CartContext);
}
