"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
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
import type { CartSummary } from "@/lib/cart/orders";

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

  const refresh = useCallback(async () => {
    try {
      const next = await getCartSummaryAction({ orgId, venueId });
      setSummary(next);
    } finally {
      setIsHydrating(false);
    }
  }, [orgId, venueId]);

  // Hydrate on mount. We deliberately defer this past the first paint so the
  // catalog itself is visible immediately even on slow networks.
  useEffect(() => {
    if (initialSummary) {
      setIsHydrating(false);
      return;
    }
    refresh();
  }, [initialSummary, refresh]);

  const runMutation = useCallback(
    async (work: () => Promise<CartSummary>, errorMessage: string) => {
      try {
        const next = await work();
        setSummary(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : errorMessage;
        toast.error(message);
        throw err;
      }
    },
    [],
  );

  const addItem: CartContextValue["addItem"] = useCallback(
    ({ itemId, variationId, quantity }) =>
      new Promise<void>((resolve, reject) => {
        startMutation(() => {
          runMutation(
            () =>
              addLineItemAction({
                orgId,
                venueId,
                itemId,
                variationId,
                quantity,
                catalogPath,
              }),
            "Could not add to cart.",
          )
            .then(resolve)
            .catch(reject);
        });
      }),
    [catalogPath, orgId, runMutation, venueId],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    (lineItemId, quantity) =>
      new Promise<void>((resolve, reject) => {
        startMutation(() => {
          runMutation(
            () =>
              updateLineItemQuantityAction({
                orgId,
                venueId,
                lineItemId,
                quantity,
                catalogPath,
              }),
            "Could not update item quantity.",
          )
            .then(resolve)
            .catch(reject);
        });
      }),
    [catalogPath, orgId, runMutation, venueId],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    (lineItemId) =>
      new Promise<void>((resolve, reject) => {
        startMutation(() => {
          runMutation(
            () =>
              removeLineItemAction({
                orgId,
                venueId,
                lineItemId,
                catalogPath,
              }),
            "Could not remove item.",
          )
            .then(resolve)
            .catch(reject);
        });
      }),
    [catalogPath, orgId, runMutation, venueId],
  );

  const clear: CartContextValue["clear"] = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        startMutation(() => {
          runMutation(
            () => clearCartAction({ orgId, venueId, catalogPath }),
            "Could not clear cart.",
          )
            .then(resolve)
            .catch(reject);
        });
      }),
    [catalogPath, orgId, runMutation, venueId],
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
