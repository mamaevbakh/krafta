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
  removeLineItemAction,
  updateLineItemQuantityAction,
} from "@/lib/cart/actions";
import type { CartLineItem, CartSummary } from "@/lib/cart/orders";

type CartContextValue = {
  summary: CartSummary;
  itemCount: number;
  isHydrating: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (next: boolean) => void;
  addItem: (input: {
    itemId: string;
    variationId?: string;
    quantity?: number;
    /** Used for placeholder when no matching line exists yet. */
    name?: string;
    basePriceCents?: number;
    variationName?: string | null;
  }) => Promise<void>;
  updateQuantity: (lineItemId: string, quantity: number) => Promise<void>;
  removeItem: (lineItemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
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

// ---- debounce bookkeeping --------------------------------------------------
//
// Server sync is debounced per "key" — line id for qty updates, item-variation
// pair for adds. The local state is authoritative during the user's session;
// we only call the server to persist for reload/checkout. Server responses
// are NOT applied back to local state — that would just cause the slow-roundtrip
// flicker the user reported. If a sync fails we surface a toast and refresh
// from the server to get back in sync.

type Pending = { timer: ReturnType<typeof setTimeout> };

// ----------------------------------------------------------------------------

type CartProviderProps = {
  orgId: string;
  venueId: string;
  catalogPath: string;
  initialSummary?: CartSummary;
  children: ReactNode;
};

export function CartProvider({
  orgId,
  venueId,
  catalogPath,
  initialSummary,
  children,
}: CartProviderProps) {
  const [summary, setSummary] = useState<CartSummary>(
    initialSummary ?? EMPTY_SUMMARY,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(!initialSummary);

  const pendingQtyTimers = useRef(new Map<string, Pending>());
  const pendingAddTimers = useRef(new Map<string, Pending>());
  const pendingAddTotals = useRef(new Map<string, number>());

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
          await addLineItemAction({
            orgId,
            venueId,
            itemId,
            variationId,
            quantity: finalQty,
            catalogPath,
          });
          // Intentionally not applying the server response — local state
          // already reflects the user's intent. We sync to server purely for
          // persistence; reading it back would create flicker.
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
          await updateLineItemQuantityAction({
            orgId,
            venueId,
            lineItemId,
            quantity,
            catalogPath,
          });
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
        await removeLineItemAction({
          orgId,
          venueId,
          lineItemId,
          catalogPath,
        });
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
      await clearCartAction({ orgId, venueId, catalogPath });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save cart change.",
      );
      refresh();
    }
  }, [cancelAllPending, catalogPath, orgId, refresh, venueId]);

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
      addItem,
      updateQuantity,
      removeItem,
      clear,
      refresh,
    }),
    [
      addItem,
      clear,
      isHydrating,
      isOpen,
      itemCount,
      refresh,
      removeItem,
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
