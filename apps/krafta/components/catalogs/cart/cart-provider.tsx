"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
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

// ---- local reducer ---------------------------------------------------------
//
// We don't use React 19's `useOptimistic` here. With debounced server sync,
// the surrounding transition settles long before the network round-trip; the
// optimistic projection would revert for the gap and the user sees a flicker
// (qty 1 → 2 → 1 → 2). Instead we treat local state as the source of truth
// while the user is interacting and reconcile from the server response.

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

// ---- reconcile -------------------------------------------------------------
//
// When a server response arrives, replace per-line state with canonical
// values EXCEPT for lines the user is still touching (debounce timer
// pending) — those keep their local view so a slow server response can't
// undo a click that landed mid-flight.

function reconcile(
  local: CartSummary,
  server: CartSummary,
  pendingLineIds: Set<string>,
  pendingAddKeys: Set<string>,
): CartSummary {
  const localById = new Map(local.lineItems.map((line) => [line.id, line]));

  // Start from server's view but swap in local for any line the user is
  // still touching.
  const reconciled: CartLineItem[] = server.lineItems.map((serverLine) => {
    if (pendingLineIds.has(serverLine.id)) {
      return localById.get(serverLine.id) ?? serverLine;
    }
    return serverLine;
  });

  // Carry forward optimistic-* placeholders for adds that haven't synced.
  // Their server-side row doesn't exist yet, so they must persist locally.
  for (const localLine of local.lineItems) {
    if (!localLine.id.startsWith("optimistic-")) continue;
    const key = `${localLine.catalog_item_id ?? ""}::${
      localLine.catalog_variation_id ?? ""
    }`;
    if (pendingAddKeys.has(key)) {
      reconciled.push(localLine);
    }
  }

  return {
    ...server,
    lineItems: reconciled,
    subtotalCents: recomputeSubtotal(reconciled),
  };
}

// ---- debounce bookkeeping --------------------------------------------------

type Resolver = { resolve: () => void; reject: (err: unknown) => void };

type Pending = {
  timer: ReturnType<typeof setTimeout>;
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
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(!initialSummary);
  const [isMutating, startMutation] = useTransition();

  const pendingQtyUpdates = useRef(new Map<string, Pending>());
  const pendingAddTotals = useRef(new Map<string, number>());
  const pendingAddTimers = useRef(new Map<string, Pending>());

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
    pendingAddTimers.current.forEach((p) => {
      clearTimeout(p.timer);
      p.resolvers.forEach((r) => r.resolve());
    });
    pendingAddTimers.current.clear();
    pendingAddTotals.current.clear();
  }, []);

  const applyServerResponse = useCallback((next: CartSummary) => {
    setSummary((prev) =>
      reconcile(
        prev,
        next,
        new Set(pendingQtyUpdates.current.keys()),
        new Set(pendingAddTotals.current.keys()),
      ),
    );
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
      // Local update — instant.
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

      return new Promise<void>((resolve, reject) => {
        const existing = pendingAddTimers.current.get(key);
        if (existing) clearTimeout(existing.timer);
        const resolvers = [...(existing?.resolvers ?? []), { resolve, reject }];

        const timer = setTimeout(() => {
          pendingAddTimers.current.delete(key);
          const finalQty = pendingAddTotals.current.get(key) ?? quantity;
          pendingAddTotals.current.delete(key);
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
              applyServerResponse(next);
              waiters.forEach((w) => w.resolve());
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Could not add to cart.";
              toast.error(message);
              waiters.forEach((w) => w.reject(err));
              // Restore from server so the local placeholder is undone.
              refresh();
            }
          });
        }, SERVER_SYNC_DEBOUNCE_MS);

        pendingAddTimers.current.set(key, { timer, resolvers });
      });
    },
    [applyServerResponse, catalogPath, orgId, refresh, venueId],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    (lineItemId, quantity) => {
      // Local update — instant.
      setSummary((prev) => applyLocal(prev, { type: "updateQuantity", lineItemId, quantity }));

      // Optimistic placeholders have no server-side row yet.
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
              applyServerResponse(next);
              waiters.forEach((w) => w.resolve());
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Could not update item quantity.";
              toast.error(message);
              waiters.forEach((w) => w.reject(err));
              refresh();
            }
          });
        }, SERVER_SYNC_DEBOUNCE_MS);

        pendingQtyUpdates.current.set(lineItemId, { timer, resolvers });
      });
    },
    [applyServerResponse, catalogPath, orgId, refresh, venueId],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    (lineItemId) => {
      setSummary((prev) => applyLocal(prev, { type: "remove", lineItemId }));
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
            applyServerResponse(next);
            resolve();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not remove item.";
            toast.error(message);
            reject(err);
            refresh();
          }
        });
      });
    },
    [applyServerResponse, cancelPendingForLine, catalogPath, orgId, refresh, venueId],
  );

  const clear: CartContextValue["clear"] = useCallback(
    () => {
      setSummary((prev) => applyLocal(prev, { type: "clear" }));
      cancelAllPending();

      return new Promise<void>((resolve, reject) => {
        startMutation(async () => {
          try {
            const next = await clearCartAction({ orgId, venueId, catalogPath });
            applyServerResponse(next);
            resolve();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not clear cart.";
            toast.error(message);
            reject(err);
            refresh();
          }
        });
      });
    },
    [applyServerResponse, cancelAllPending, catalogPath, orgId, refresh, venueId],
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
