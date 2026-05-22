"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  addLineItemAction,
  clearCartAction,
  getCartSummaryAction,
  placeOrderAction,
  removeLineItemAction,
  updateLineItemQuantityAction,
} from "@/lib/cart/actions";
import type {
  CartLineItem,
  CartLineItemModifier,
  CartSummary,
} from "@/lib/cart/orders";
import {
  modifierSignature,
  type ModifierSelection,
} from "@/lib/cart/modifier-signature";
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

// 2.5s of inactivity before pushing to the server. The cart is the user's
// scratchpad until they hit "Continue" — we just need persistence across
// reloads and the right state at checkout time.
const SERVER_SYNC_DEBOUNCE_MS = 2500;

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

export function CartProvider({
  orgId,
  venueId,
  catalogPath,
  modes,
  taxes = [],
  initialSummary,
  children,
}: CartProviderProps) {
  const [summary, setSummary] = useState<CartSummary>(
    initialSummary ?? EMPTY_SUMMARY,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(!initialSummary);
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

  // QR-driven dine-in lock hydration.
  //
  // Source of truth chain (highest → lowest priority):
  //   1. URL params on first render: ?mode=dine_in&table={n}
  //   2. sessionStorage for this venue (keyed per-venueId so two venues
  //      open in the same tab don't cross-contaminate). Surviving refresh
  //      is the whole point — customer scans QR, the page reloads to
  //      pull catalog data, the lock must persist.
  //   3. null — free-form mode picker.
  //
  // We intentionally do not write to URL; URL is a one-shot intent
  // signal. The customer can keep navigating the catalog without
  // dragging ?mode=…&table=… along.
  const searchParams = useSearchParams();
  const storageKey = `krafta.cart.dineIn.${venueId}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const modeParam = searchParams?.get("mode");
    const tableParam = searchParams?.get("table");
    if (modeParam === "dine_in" && tableParam && tableParam.trim().length > 0) {
      const next = { tableLabel: tableParam.trim() };
      setDineInLock(next);
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Quota / private browsing — non-fatal; the in-memory lock
        // still works for this session.
      }
      return;
    }
    // No URL signal — hydrate from sessionStorage if present.
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
    // pair so this re-checks if the user navigates with a new ?mode= URL.
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
      const next = await getCartSummaryAction({ orgId, venueId });
      setSummary(next);
    } finally {
      setIsHydrating(false);
    }
  }, [orgId, venueId]);

  useEffect(() => {
    if (initialSummary) {
      setIsHydrating(false);
      return;
    }
    refresh();
  }, [initialSummary, refresh]);

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

      const timer = setTimeout(async () => {
        pendingAddTimers.current.delete(key);
        const finalQty = pendingAddTotals.current.get(key) ?? quantity;
        const finalMods = pendingAddModifiers.current.get(key) ?? [];
        pendingAddTotals.current.delete(key);
        pendingAddModifiers.current.delete(key);
        try {
          const next = await addLineItemAction({
            orgId,
            venueId,
            itemId,
            variationId,
            quantity: finalQty,
            modifiers: finalMods,
            catalogPath,
          });
          // Reconcile only if the user has not started a new add for this
          // (item, variation) during the round-trip. If they have, the next
          // debounced sync will reconcile.
          if (!pendingAddTimers.current.has(key)) {
            setSummary(next);
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
    [catalogPath, orgId, refresh, venueId],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    async (lineItemId, quantity) => {
      setSummary((prev) =>
        applyLocal(prev, { type: "updateQuantity", lineItemId, quantity }),
      );

      // Local-only placeholders have no server-side row yet; the next
      // debounced add will reconcile them.
      if (lineItemId.startsWith("local-")) return;

      const existing = pendingQtyTimers.current.get(lineItemId);
      if (existing) clearTimeout(existing.timer);

      const timer = setTimeout(async () => {
        pendingQtyTimers.current.delete(lineItemId);
        try {
          const next = await updateLineItemQuantityAction({
            orgId,
            venueId,
            lineItemId,
            quantity,
            catalogPath,
          });
          // Reconcile only if the user has not clicked +/- on this line
          // during the round-trip. The next debounce will handle that case.
          if (!pendingQtyTimers.current.has(lineItemId)) {
            setSummary(next);
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
    [catalogPath, orgId, refresh, venueId],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    async (lineItemId) => {
      setSummary((prev) => applyLocal(prev, { type: "remove", lineItemId }));
      cancelPendingForLine(lineItemId);

      if (lineItemId.startsWith("local-")) return;

      try {
        const next = await removeLineItemAction({
          orgId,
          venueId,
          lineItemId,
          catalogPath,
        });
        setSummary(next);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : tRef.current("errors.cart_save_failed"),
        );
        refresh();
      }
    },
    [cancelPendingForLine, catalogPath, orgId, refresh, venueId],
  );

  const clear: CartContextValue["clear"] = useCallback(async () => {
    setSummary((prev) => applyLocal(prev, { type: "clear" }));
    cancelAllPending();

    try {
      const next = await clearCartAction({ orgId, venueId, catalogPath });
      setSummary(next);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : tRef.current("errors.cart_save_failed"),
      );
      refresh();
    }
  }, [cancelAllPending, catalogPath, orgId, refresh, venueId]);

  // Fire pending debounced writes immediately. Used before checkout to make
  // sure the server has the latest cart contents before we transition the
  // order from draft to open.
  const flush: CartContextValue["flush"] = useCallback(async () => {
    const pendingPromises: Promise<unknown>[] = [];

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
        const message =
          rawMessage && rawMessage in knownCodes
            ? tRef.current(knownCodes[rawMessage]!)
            : (rawMessage ?? tRef.current("errors.place_order_failed"));
        toast.error(message);
        return { ok: false, error: message } as const;
      } finally {
        setIsPlacingOrder(false);
        placeInFlightRef.current = false;
      }
    },
    [catalogPath, flush, orgId, summary.lineItems, summary.subtotalCents, tipCents, venueId],
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
      placedOrderId,
      placedOrder,
      isPlacingOrder,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      refresh,
      flush,
      placeOrder,
    }),
    [
      addItem,
      clear,
      clearDineInLock,
      dineInLock,
      flush,
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
