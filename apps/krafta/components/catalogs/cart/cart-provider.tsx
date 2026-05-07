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
import { toast } from "sonner";

import {
  addLineItemAction,
  clearCartAction,
  getCartSummaryAction,
  placeOrderAction,
  removeLineItemAction,
  updateLineItemQuantityAction,
} from "@/lib/cart/actions";
import type { CartLineItem, CartSummary } from "@/lib/cart/orders";
import type { PlaceOrderInput } from "@/lib/cart/checkout";

export type CartFulfillmentMode = "dine_in" | "pickup" | "delivery";
export type CartStep = "cart" | "checkout" | "placed";

export type PlacedOrderSnapshot =
  | {
      orderId: string;
      mode: "dine_in";
      fields: { tableLabel: string };
      lineItems: CartLineItem[];
      subtotalCents: number;
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
  /** Current step inside the drawer: cart list, checkout fields, or confirmation. */
  step: CartStep;
  setStep: (next: CartStep) => void;
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
    }
  | { type: "updateQuantity"; lineItemId: string; quantity: number }
  | { type: "remove"; lineItemId: string }
  | { type: "clear" };

function recomputeSubtotal(lineItems: CartLineItem[]): number {
  return lineItems.reduce((sum, line) => sum + line.total_price_cents, 0);
}

function applyLocal(state: CartSummary, action: LocalAction): CartSummary {
  switch (action.type) {
    case "add": {
      const matchingIndex = state.lineItems.findIndex(
        (line) =>
          line.catalog_item_id === action.itemId &&
          line.catalog_variation_id === action.variationId,
      );

      if (matchingIndex >= 0) {
        const next = [...state.lineItems];
        const existing = next[matchingIndex];
        const nextQty = existing.quantity + action.quantity;
        next[matchingIndex] = {
          ...existing,
          quantity: nextQty,
          total_price_cents: existing.base_price_cents * nextQty,
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
        total_price_cents: action.basePriceCents * action.quantity,
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
              total_price_cents: line.base_price_cents * action.quantity,
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
  initialSummary?: CartSummary;
  children: ReactNode;
};

export function CartProvider({
  orgId,
  venueId,
  catalogPath,
  modes,
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

  const pendingQtyTimers = useRef(new Map<string, Pending>());
  const pendingAddTimers = useRef(new Map<string, Pending>());
  const pendingAddTotals = useRef(new Map<string, number>());

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
  }, []);

  const addItem: CartContextValue["addItem"] = useCallback(
    async ({
      itemId,
      variationId,
      quantity = 1,
      name = "Adding…",
      basePriceCents = 0,
      variationName = null,
    }) => {
      setSummary((prev) =>
        applyLocal(prev, {
          type: "add",
          itemId,
          variationId: variationId ?? null,
          quantity,
          name,
          variationName,
          basePriceCents,
        }),
      );

      const key = `${itemId}::${variationId ?? ""}`;
      pendingAddTotals.current.set(
        key,
        (pendingAddTotals.current.get(key) ?? 0) + quantity,
      );

      const existing = pendingAddTimers.current.get(key);
      if (existing) clearTimeout(existing.timer);

      const timer = setTimeout(async () => {
        pendingAddTimers.current.delete(key);
        const finalQty = pendingAddTotals.current.get(key) ?? quantity;
        pendingAddTotals.current.delete(key);
        try {
          const next = await addLineItemAction({
            orgId,
            venueId,
            itemId,
            variationId,
            quantity: finalQty,
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
            err instanceof Error ? err.message : "Could not save cart change.",
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
            err instanceof Error ? err.message : "Could not save cart change.",
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
          err instanceof Error ? err.message : "Could not save cart change.",
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
        err instanceof Error ? err.message : "Could not save cart change.",
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

    // Fire pending adds immediately with the accumulated quantity.
    for (const [key, pending] of pendingAddTimers.current.entries()) {
      clearTimeout(pending.timer);
      const [itemId, variationId] = key.split("::");
      const accumQty = pendingAddTotals.current.get(key) ?? 1;
      pendingPromises.push(
        addLineItemAction({
          orgId,
          venueId,
          itemId,
          variationId: variationId || undefined,
          quantity: accumQty,
          catalogPath,
        }),
      );
    }
    pendingAddTimers.current.clear();
    pendingAddTotals.current.clear();

    if (pendingPromises.length === 0) return;
    await Promise.allSettled(pendingPromises);
  }, [catalogPath, orgId, summary.lineItems, venueId]);

  const placeOrder: CartContextValue["placeOrder"] = useCallback(
    async (input) => {
      setIsPlacingOrder(true);
      try {
        await flush();
        const result = await placeOrderAction({
          orgId,
          venueId,
          catalogPath,
          ...input,
        } as Parameters<typeof placeOrderAction>[0]);

        // Snapshot the cart at place-time so the confirmation step can
        // render line items + totals after the local cart is cleared.
        const snapshotBase = {
          orderId: result.orderId,
          lineItems: summary.lineItems,
          subtotalCents: summary.subtotalCents,
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
        const message =
          err instanceof Error ? err.message : "Could not place order.";
        toast.error(message);
        return { ok: false, error: message } as const;
      } finally {
        setIsPlacingOrder(false);
      }
    },
    [catalogPath, flush, orgId, summary.lineItems, summary.subtotalCents, venueId],
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
      step,
      setStep,
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
