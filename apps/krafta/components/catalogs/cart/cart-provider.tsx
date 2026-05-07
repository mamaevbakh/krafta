"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
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

      // No matching line yet — synthesize a placeholder. The id is prefixed
      // so we can recognize and skip server mutations against it (a user
      // who clicks +/- before the action returns hits the optimistic row).
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
  // Optimistic projection: shows pending changes during a transition,
  // automatically reverts to `summary` when the transition resolves.
  const [optimisticSummary, addOptimistic] = useOptimistic(
    summary,
    applyOptimistic,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(!initialSummary);
  const [isMutating, startMutation] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const next = await getCartSummaryAction({ orgId, venueId });
      setSummary(next);
    } finally {
      setIsHydrating(false);
    }
  }, [orgId, venueId]);

  // Hydrate on mount.
  useEffect(() => {
    if (initialSummary) {
      setIsHydrating(false);
      return;
    }
    refresh();
  }, [initialSummary, refresh]);

  const addItem: CartContextValue["addItem"] = useCallback(
    ({
      itemId,
      variationId,
      quantity = 1,
      name = "Adding…",
      basePriceCents = 0,
      variationName = null,
    }) =>
      new Promise<void>((resolve, reject) => {
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
          try {
            const next = await addLineItemAction({
              orgId,
              venueId,
              itemId,
              variationId,
              quantity,
              catalogPath,
            });
            setSummary(next);
            resolve();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not add to cart.";
            toast.error(message);
            reject(err);
          }
        });
      }),
    [addOptimistic, catalogPath, orgId, venueId],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    (lineItemId, quantity) =>
      new Promise<void>((resolve, reject) => {
        // Don't drive a server call against an optimistic placeholder — the
        // real id doesn't exist yet. The next add/refresh will reconcile.
        if (lineItemId.startsWith("optimistic-")) {
          resolve();
          return;
        }
        startMutation(async () => {
          addOptimistic({ type: "updateQuantity", lineItemId, quantity });
          try {
            const next = await updateLineItemQuantityAction({
              orgId,
              venueId,
              lineItemId,
              quantity,
              catalogPath,
            });
            setSummary(next);
            resolve();
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "Could not update item quantity.";
            toast.error(message);
            reject(err);
          }
        });
      }),
    [addOptimistic, catalogPath, orgId, venueId],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    (lineItemId) =>
      new Promise<void>((resolve, reject) => {
        if (lineItemId.startsWith("optimistic-")) {
          resolve();
          return;
        }
        startMutation(async () => {
          addOptimistic({ type: "remove", lineItemId });
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
      }),
    [addOptimistic, catalogPath, orgId, venueId],
  );

  const clear: CartContextValue["clear"] = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        startMutation(async () => {
          addOptimistic({ type: "clear" });
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
      }),
    [addOptimistic, catalogPath, orgId, venueId],
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
