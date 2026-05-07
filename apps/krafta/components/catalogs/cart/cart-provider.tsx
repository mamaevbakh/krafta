"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
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
  isMutating: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (next: boolean) => void;
  addItem: (input: {
    itemId: string;
    variationId?: string;
    quantity?: number;
    /** Used for optimistic placeholder when no matching line exists yet. */
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

const SERVER_SYNC_DEBOUNCE_MS = 250;

// ---- optimistic reducer ----------------------------------------------------

type OptimisticAction =
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

function applyOptimistic(
  state: CartSummary,
  action: OptimisticAction,
): CartSummary {
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
        id: `optimistic-${
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

// ---- debounced server sync -------------------------------------------------
//
// Each rapid +/- click should not fan out into N parallel UPDATE calls — that
// races at both the network and DB layer and can leave the persisted qty
// behind the user's intent. We coalesce per (key) into one server call after
// `SERVER_SYNC_DEBOUNCE_MS` of inactivity.
//
// updateQuantity: key=lineItemId, value=absolute target qty (last write wins).
// addItem:        key=`${itemId}::${variationId}`, value=accumulated qty.

type Resolver = { resolve: () => void; reject: (err: unknown) => void };

type Pending<T> = {
  timer: ReturnType<typeof setTimeout>;
  payload: T;
  resolvers: Resolver[];
};

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
  const [optimisticSummary, addOptimistic] = useOptimistic(
    summary,
    applyOptimistic,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(!initialSummary);
  const [isMutating, startMutation] = useTransition();

  const pendingQtyUpdates = useRef(
    new Map<string, Pending<{ quantity: number }>>(),
  );
  const pendingAdds = useRef(
    new Map<
      string,
      Pending<{
        itemId: string;
        variationId?: string;
        quantity: number;
      }>
    >(),
  );

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

  // Cancel any pending debounced sync targeting a given line (called on
  // remove/clear so we don't fire a stale UPDATE against a row that's about
  // to disappear). Resolvers are released so the call sites' Promises don't
  // hang forever.
  const cancelPendingForLine = useCallback((lineItemId: string) => {
    const pending = pendingQtyUpdates.current.get(lineItemId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingQtyUpdates.current.delete(lineItemId);
      pending.resolvers.forEach((r) => r.resolve());
    }
  }, []);

  const cancelAllPending = useCallback(() => {
    pendingQtyUpdates.current.forEach((p) => {
      clearTimeout(p.timer);
      p.resolvers.forEach((r) => r.resolve());
    });
    pendingQtyUpdates.current.clear();
    pendingAdds.current.forEach((p) => {
      clearTimeout(p.timer);
      p.resolvers.forEach((r) => r.resolve());
    });
    pendingAdds.current.clear();
  }, []);

  const addItem: CartContextValue["addItem"] = useCallback(
    ({
      itemId,
      variationId,
      quantity = 1,
      name = "Adding…",
      basePriceCents = 0,
      variationName = null,
    }) => {
      // Optimistic update — instant. Each click pushes another optimistic +qty.
      startMutation(async () => {
        addOptimistic({
          type: "add",
          itemId,
          variationId: variationId ?? null,
          quantity,
          name,
          variationName,
          basePriceCents,
        });
      });

      const key = `${itemId}::${variationId ?? ""}`;
      return new Promise<void>((resolve, reject) => {
        const existing = pendingAdds.current.get(key);
        if (existing) clearTimeout(existing.timer);

        const accumQty = (existing?.payload.quantity ?? 0) + quantity;
        const resolvers = [...(existing?.resolvers ?? []), { resolve, reject }];

        const timer = setTimeout(() => {
          pendingAdds.current.delete(key);
          const finalQty = accumQty;
          const waiters = resolvers;
          startMutation(async () => {
            try {
              const next = await addLineItemAction({
                orgId,
                venueId,
                itemId,
                variationId,
                quantity: finalQty,
                catalogPath,
              });
              setSummary(next);
              waiters.forEach((w) => w.resolve());
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Could not add to cart.";
              toast.error(message);
              waiters.forEach((w) => w.reject(err));
            }
          });
        }, SERVER_SYNC_DEBOUNCE_MS);

        pendingAdds.current.set(key, {
          timer,
          payload: { itemId, variationId, quantity: accumQty },
          resolvers,
        });
      });
    },
    [addOptimistic, catalogPath, orgId, venueId],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    (lineItemId, quantity) => {
      // Optimistic update — instant.
      startMutation(async () => {
        addOptimistic({ type: "updateQuantity", lineItemId, quantity });
      });

      // Don't sync optimistic placeholders — the server-side row doesn't
      // exist yet; the next add response will reconcile.
      if (lineItemId.startsWith("optimistic-")) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        const existing = pendingQtyUpdates.current.get(lineItemId);
        if (existing) clearTimeout(existing.timer);

        const resolvers = [...(existing?.resolvers ?? []), { resolve, reject }];

        const timer = setTimeout(() => {
          pendingQtyUpdates.current.delete(lineItemId);
          const finalQty = quantity; // last write wins
          const waiters = resolvers;
          startMutation(async () => {
            try {
              const next = await updateLineItemQuantityAction({
                orgId,
                venueId,
                lineItemId,
                quantity: finalQty,
                catalogPath,
              });
              setSummary(next);
              waiters.forEach((w) => w.resolve());
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Could not update item quantity.";
              toast.error(message);
              waiters.forEach((w) => w.reject(err));
            }
          });
        }, SERVER_SYNC_DEBOUNCE_MS);

        pendingQtyUpdates.current.set(lineItemId, {
          timer,
          payload: { quantity },
          resolvers,
        });
      });
    },
    [addOptimistic, catalogPath, orgId, venueId],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    (lineItemId) => {
      startMutation(async () => {
        addOptimistic({ type: "remove", lineItemId });
      });

      cancelPendingForLine(lineItemId);

      if (lineItemId.startsWith("optimistic-")) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        startMutation(async () => {
          try {
            const next = await removeLineItemAction({
              orgId,
              venueId,
              lineItemId,
              catalogPath,
            });
            setSummary(next);
            resolve();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not remove item.";
            toast.error(message);
            reject(err);
          }
        });
      });
    },
    [addOptimistic, cancelPendingForLine, catalogPath, orgId, venueId],
  );

  const clear: CartContextValue["clear"] = useCallback(
    () => {
      startMutation(async () => {
        addOptimistic({ type: "clear" });
      });

      cancelAllPending();

      return new Promise<void>((resolve, reject) => {
        startMutation(async () => {
          try {
            const next = await clearCartAction({ orgId, venueId, catalogPath });
            setSummary(next);
            resolve();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not clear cart.";
            toast.error(message);
            reject(err);
          }
        });
      });
    },
    [addOptimistic, cancelAllPending, catalogPath, orgId, venueId],
  );

  const itemCount = optimisticSummary.lineItems.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  const value = useMemo<CartContextValue>(
    () => ({
      summary: optimisticSummary,
      itemCount,
      isHydrating,
      isMutating,
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
      isMutating,
      isOpen,
      itemCount,
      optimisticSummary,
      refresh,
      removeItem,
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
