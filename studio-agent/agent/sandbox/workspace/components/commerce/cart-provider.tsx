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

import {
  CommerceError,
  type Cart,
  type CartLine,
  type CartLineInput,
  type CheckoutInput,
  type Currency,
  type Order,
  type OrderMode,
  type PricingBreakdown,
  type PricingInput,
} from "@/lib/commerce-client";

import { commerce } from "@/lib/commerce";
import { lineSignature, type LineSelection } from "@/lib/cart/signature";
import {
  clearPersistedCart,
  loadPersistedCart,
  savePersistedCart,
  type CartLedgerEntry,
} from "@/lib/cart/storage";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY ?? "";

/** Trailing-edge window for coalescing rapid stepper taps into one batched
 *  `setLines`. Adds flush immediately (each is its own line); only +/- taps on
 *  an existing line debounce. */
const FLUSH_DEBOUNCE_MS = 220;

/** A cart line plus its resolved client signature, so the UI's stepper/remove
 *  controls know which selection to resend. */
export type DisplayLine = CartLine & { sig: string };

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; code: string; message: string };

type CartContextValue = {
  /** The engine's authoritative cart (money + line totals). Null until the
   *  first add mints one. */
  cart: Cart | null;
  /** Lines to render — server lines with the optimistic quantity applied. */
  lines: DisplayLine[];
  /** Server-computed subtotal in cents. Always from the engine. */
  subtotalCents: number;
  currency: Currency;
  orderModes: OrderMode[];
  /** Sum of line quantities, with pending taps reflected (header badge). */
  itemCount: number;
  /** Restoring a persisted cart on first mount. */
  isHydrating: boolean;
  /** A `setLines` write is in flight. */
  isMutating: boolean;
  /** Last write error, surfaced in the drawer; cleared on the next success. */
  error: string | null;
  clearError: () => void;

  // Drawer chrome
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (next: boolean) => void;

  // Mutations — fire-and-forget; correctness comes from the server cart we
  // store after each write.
  addLine: (input: CartLineInput) => void;
  setLineQty: (line: DisplayLine, qty: number) => void;
  removeLine: (line: DisplayLine) => void;

  // Checkout
  getPricing: (input: PricingInput) => Promise<PricingBreakdown>;
  placeOrder: (input: CheckoutInput) => Promise<PlaceOrderResult>;
  /** Drop the cart token + ledger after an order is placed / for "start over". */
  reset: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function friendlyCheckoutMessage(code: string): string {
  switch (code) {
    case "price_changed":
      return "Some prices changed while you were shopping. We refreshed your cart — please review and try again.";
    case "out_of_zone":
      return "That delivery address is outside the delivery area.";
    case "below_min_order":
      return "Your order is below the delivery minimum.";
    case "phone_invalid":
      return "That phone number doesn't look right. Please check it.";
    case "tip_too_high":
      return "That tip is too large. Please lower it.";
    case "cart_empty":
      return "Your cart is empty.";
    default:
      return "We couldn't place your order. Please try again.";
  }
}

type CartProviderProps = {
  currency: Currency;
  orderModes: OrderMode[];
  children: ReactNode;
};

export function CartProvider({
  currency,
  orderModes,
  children,
}: CartProviderProps) {
  // ── Render-driving state ──────────────────────────────────────────────
  const [cart, setCart] = useState<Cart | null>(null);
  // Pending absolute-qty intents, keyed by line signature. Empty ⇒ the UI
  // shows the server cart verbatim. A `setLines` response clears the entries
  // it just persisted, so this naturally drains to empty.
  const [desired, setDesired] = useState<Record<string, number>>({});
  const [isHydrating, setIsHydrating] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // ── Refs read inside async flushes (always latest, no stale closures) ──
  const cartRef = useRef<Cart | null>(null);
  cartRef.current = cart;
  const desiredRef = useRef(desired);
  desiredRef.current = desired;

  /** cartToken — the engine's bearer secret for this shopper's cart. */
  const tokenRef = useRef<string | null>(null);
  /** sig → the selection we sent (resend with a new qty to mutate the line). */
  const entriesRef = useRef<Map<string, LineSelection>>(new Map());
  /** sig → engine line id. Built by diffing line ids across writes, so it's
   *  robust to default-on / hidden modifiers the engine adds to a line. */
  const lineIdBySigRef = useRef<Map<string, string>>(new Map());

  // ── Flush machinery ───────────────────────────────────────────────────
  const dirtyRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Serializes writes — a new flush always awaits the previous one, so two
   *  absolute-qty batches can never land out of order. */
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());
  /** De-dupes concurrent `createCart` calls from rapid first adds. */
  const createPromiseRef = useRef<Promise<string> | null>(null);

  // ── Persistence ───────────────────────────────────────────────────────
  const persist = useCallback(() => {
    if (!tokenRef.current) {
      clearPersistedCart(PUBLISHABLE_KEY);
      return;
    }
    const entries: CartLedgerEntry[] = [...entriesRef.current].map(
      ([sig, selection]) => ({ sig, selection }),
    );
    savePersistedCart(PUBLISHABLE_KEY, {
      cartToken: tokenRef.current,
      entries,
      lineIds: [...lineIdBySigRef.current],
    });
  }, []);

  /**
   * Fold a fresh engine cart into local state:
   *  - map any newly-inserted line ids onto the signatures we just wrote,
   *  - drop ledger entries for lines that no longer exist,
   *  - clear the optimistic intents this write satisfied,
   *  - commit the server cart as the source of truth for money.
   */
  const applyServerCart = useCallback(
    (next: Cart, ctx: { flushedSigs: string[]; prevIds: Set<string> }) => {
      const nextIds = new Set(next.lines.map((l) => l.lineId));

      // Forget mappings whose line the engine removed.
      for (const [sig, id] of [...lineIdBySigRef.current]) {
        if (!nextIds.has(id)) lineIdBySigRef.current.delete(sig);
      }

      // Assign engine line ids to the signatures we just inserted. New lines =
      // ids not present before AND not already claimed by a signature. Match by
      // (item, variation); a single-line add (the common case) is unambiguous.
      const claimed = new Set(lineIdBySigRef.current.values());
      const newLines = next.lines.filter(
        (l) => !ctx.prevIds.has(l.lineId) && !claimed.has(l.lineId),
      );
      const needSigs = ctx.flushedSigs.filter(
        (sig) => !lineIdBySigRef.current.has(sig) && entriesRef.current.has(sig),
      );
      for (const line of newLines) {
        const idx = needSigs.findIndex((sig) => {
          const sel = entriesRef.current.get(sig);
          return (
            sel?.itemId === line.itemId &&
            sel?.variationId === line.variationId
          );
        });
        if (idx >= 0) {
          lineIdBySigRef.current.set(needSigs[idx], line.lineId);
          needSigs.splice(idx, 1);
        }
      }

      // Prune ledger entries that are neither on the server nor pending.
      for (const sig of [...entriesRef.current.keys()]) {
        const hasLine = lineIdBySigRef.current.has(sig);
        const isPending = sig in desiredRef.current;
        if (!hasLine && !isPending) entriesRef.current.delete(sig);
      }

      // Clear the optimistic intents this batch persisted. Keep any signature
      // that was re-tapped while the write was in flight (still dirty) so its
      // newer optimistic qty doesn't flicker back to the just-committed value.
      const clearSigs = new Set(
        ctx.flushedSigs.filter((sig) => !dirtyRef.current.has(sig)),
      );
      if (clearSigs.size > 0) {
        setDesired((prev) => {
          const out: Record<string, number> = {};
          for (const [sig, qty] of Object.entries(prev)) {
            if (!clearSigs.has(sig)) out[sig] = qty;
          }
          desiredRef.current = out;
          return out;
        });
      }

      cartRef.current = next;
      setCart(next);
      persist();
    },
    [persist],
  );

  // ── Lazy cart creation ────────────────────────────────────────────────
  const ensureCart = useCallback(async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current;
    if (createPromiseRef.current) return createPromiseRef.current;
    createPromiseRef.current = (async () => {
      const created = await commerce.createCart();
      tokenRef.current = created.cartToken;
      applyServerCart(created, { flushedSigs: [], prevIds: new Set() });
      return created.cartToken;
    })();
    try {
      return await createPromiseRef.current;
    } finally {
      createPromiseRef.current = null;
    }
  }, [applyServerCart]);

  // ── Core write ────────────────────────────────────────────────────────
  const doFlush = useCallback(async () => {
    if (dirtyRef.current.size === 0) return;
    const sigs = [...dirtyRef.current];
    dirtyRef.current.clear();

    const lines: CartLineInput[] = [];
    for (const sig of sigs) {
      const selection = entriesRef.current.get(sig);
      if (!selection) continue;
      lines.push({ ...selection, qty: Math.max(0, desiredRef.current[sig] ?? 0) });
    }
    if (lines.length === 0) return;

    const prevIds = new Set((cartRef.current?.lines ?? []).map((l) => l.lineId));
    setIsMutating(true);
    try {
      const token = await ensureCart();
      const next = await commerce.setLines(token, lines);
      setError(null);
      applyServerCart(next, { flushedSigs: sigs, prevIds });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't update your cart.",
      );
      // Drop the optimistic intents for this failed batch so the UI reverts to
      // the last good server cart rather than lying about the quantity.
      setDesired((prev) => {
        const out: Record<string, number> = {};
        for (const [sig, qty] of Object.entries(prev)) {
          if (!sigs.includes(sig)) out[sig] = qty;
        }
        desiredRef.current = out;
        return out;
      });
    } finally {
      setIsMutating(false);
    }
  }, [applyServerCart, ensureCart]);

  /** Run `doFlush` on the serialized chain (never two writes concurrently). */
  const runFlush = useCallback((): Promise<void> => {
    const p = flushChainRef.current.then(() => doFlush());
    flushChainRef.current = p.catch(() => {});
    return p;
  }, [doFlush]);

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void runFlush();
    }, FLUSH_DEBOUNCE_MS);
  }, [runFlush]);

  const flushNow = useCallback((): Promise<void> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    return runFlush();
  }, [runFlush]);

  /** Set the optimistic qty for a signature and mark it for the next flush. */
  const queue = useCallback((sig: string, qty: number) => {
    dirtyRef.current.add(sig);
    setDesired((prev) => {
      const out = { ...prev, [sig]: Math.max(0, qty) };
      desiredRef.current = out;
      return out;
    });
  }, []);

  // ── Signature resolution (server line → its selection) ────────────────
  // Pure: maps a server line back to the signature of the selection that made
  // it (via the line-id ledger). For a foreign / unmapped line (e.g. a cart
  // token pasted into another browser) it falls back to a no-modifier
  // signature so simple lines still adjust — customised foreign lines are out
  // of scope, since the same browser always holds the ledger.
  const resolveSig = useCallback((line: CartLine): string => {
    for (const [sig, id] of lineIdBySigRef.current) {
      if (id === line.lineId) return sig;
    }
    return lineSignature({
      itemId: line.itemId,
      variationId: line.variationId,
      modifiers: [],
    });
  }, []);

  /** Guarantee a ledger entry exists for a line's signature before mutating it
   *  — covers the foreign-line fallback (creates a no-modifier selection). */
  const ensureEntry = useCallback((sig: string, line: CartLine) => {
    if (!entriesRef.current.has(sig)) {
      entriesRef.current.set(sig, {
        itemId: line.itemId,
        variationId: line.variationId,
      });
    }
  }, []);

  // ── Public mutations ──────────────────────────────────────────────────
  const addLine = useCallback(
    (input: CartLineInput) => {
      const selection: LineSelection = {
        itemId: input.itemId,
        variationId: input.variationId,
        modifiers: input.modifiers,
      };
      const sig = lineSignature(selection);
      entriesRef.current.set(sig, selection);

      // Absolute target = whatever we already intend (or the server has) + the
      // amount being added. Reading the ref means rapid synchronous adds stack.
      const current =
        sig in desiredRef.current
          ? desiredRef.current[sig]
          : currentServerQty(sig);
      queue(sig, current + Math.max(1, input.qty || 1));
      // Adds flush right away: each new configuration is its own line, so the
      // insert→line-id mapping stays unambiguous.
      void flushNow();
    },
    // currentServerQty depends only on refs; queue/flushNow are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, flushNow],
  );

  const setLineQty = useCallback(
    (line: DisplayLine, qty: number) => {
      const sig = line.sig || resolveSig(line);
      ensureEntry(sig, line);
      queue(sig, qty);
      scheduleFlush();
    },
    [ensureEntry, queue, resolveSig, scheduleFlush],
  );

  const removeLine = useCallback(
    (line: DisplayLine) => {
      const sig = line.sig || resolveSig(line);
      ensureEntry(sig, line);
      queue(sig, 0);
      scheduleFlush();
    },
    [ensureEntry, queue, resolveSig, scheduleFlush],
  );

  /** Current engine quantity for a signature (0 if not on the server yet). */
  function currentServerQty(sig: string): number {
    const id = lineIdBySigRef.current.get(sig);
    if (!id) return 0;
    const line = (cartRef.current?.lines ?? []).find((l) => l.lineId === id);
    return line?.qty ?? 0;
  }

  // ── Derived view ──────────────────────────────────────────────────────
  const lines = useMemo<DisplayLine[]>(() => {
    const out: DisplayLine[] = [];
    for (const line of cart?.lines ?? []) {
      const sig = resolveSig(line);
      const qty = sig in desired ? desired[sig] : line.qty;
      if (qty <= 0) continue; // optimistically removed
      out.push({ ...line, sig, qty });
    }
    return out;
    // resolveSig reads refs that move in lockstep with `cart`; desired is state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, desired]);

  const itemCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of cart?.lines ?? []) {
      counts.set(resolveSig(line), line.qty);
    }
    for (const [sig, qty] of Object.entries(desired)) counts.set(sig, qty);
    let total = 0;
    for (const qty of counts.values()) if (qty > 0) total += qty;
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, desired]);

  // ── Checkout ──────────────────────────────────────────────────────────
  const getPricing = useCallback(
    async (input: PricingInput): Promise<PricingBreakdown> => {
      const token = tokenRef.current ?? (await ensureCart());
      return commerce.getCartPricing(token, input);
    },
    [ensureCart],
  );

  const placeOrder = useCallback(
    async (input: CheckoutInput): Promise<PlaceOrderResult> => {
      const token = tokenRef.current;
      if (!token) {
        return { ok: false, code: "cart_empty", message: "Your cart is empty." };
      }
      // Make sure every pending tap has reached the server before we place.
      await flushNow();
      await flushChainRef.current;
      try {
        const result = await commerce.checkout(token, input);
        const order = await commerce.getOrder(result.orderId, token);
        return { ok: true, order };
      } catch (err) {
        const code = err instanceof CommerceError ? err.code : "unknown";
        if (code === "price_changed") {
          // Re-sync so the customer sees the corrected prices.
          try {
            const fresh = await commerce.getCart(token);
            applyServerCart(fresh, {
              flushedSigs: [],
              prevIds: new Set(fresh.lines.map((l) => l.lineId)),
            });
          } catch {
            /* best effort */
          }
        }
        return { ok: false, code, message: friendlyCheckoutMessage(code) };
      }
    },
    [applyServerCart, flushNow],
  );

  const reset = useCallback(() => {
    tokenRef.current = null;
    entriesRef.current.clear();
    lineIdBySigRef.current.clear();
    dirtyRef.current.clear();
    desiredRef.current = {};
    cartRef.current = null;
    setDesired({});
    setCart(null);
    setError(null);
    clearPersistedCart(PUBLISHABLE_KEY);
  }, []);

  // ── Hydrate from localStorage on mount ────────────────────────────────
  useEffect(() => {
    const saved = loadPersistedCart(PUBLISHABLE_KEY);
    if (!saved) {
      setIsHydrating(false);
      return;
    }
    tokenRef.current = saved.cartToken;
    entriesRef.current = new Map(saved.entries.map((e) => [e.sig, e.selection]));
    lineIdBySigRef.current = new Map(saved.lineIds);
    commerce
      .getCart(saved.cartToken)
      .then((fresh) =>
        applyServerCart(fresh, {
          flushedSigs: [],
          prevIds: new Set(fresh.lines.map((l) => l.lineId)),
        }),
      )
      .catch(() => {
        // Expired / invalid token — discard and start fresh.
        tokenRef.current = null;
        entriesRef.current.clear();
        lineIdBySigRef.current.clear();
        clearPersistedCart(PUBLISHABLE_KEY);
      })
      .finally(() => setIsHydrating(false));
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      lines,
      subtotalCents: cart?.subtotalCents ?? 0,
      currency: cart?.currency ?? currency,
      orderModes,
      itemCount,
      isHydrating,
      isMutating,
      error,
      clearError: () => setError(null),
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      setOpen: setIsOpen,
      addLine,
      setLineQty,
      removeLine,
      getPricing,
      placeOrder,
      reset,
    }),
    [
      cart,
      lines,
      currency,
      orderModes,
      itemCount,
      isHydrating,
      isMutating,
      error,
      isOpen,
      addLine,
      setLineQty,
      removeLine,
      getPricing,
      placeOrder,
      reset,
    ],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = use(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>.");
  return ctx;
}

/** Null when rendered outside a provider — lets shared components (e.g. a
 *  product card on a preview page with no cart) degrade gracefully. */
export function useOptionalCart(): CartContextValue | null {
  return use(CartContext);
}
