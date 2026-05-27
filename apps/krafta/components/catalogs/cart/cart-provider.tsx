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
import { modifierSignature } from "@/lib/cart/modifier-signature";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import type { PublicTax } from "@/lib/catalogs/types";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";

import {
  toModifierSelections,
  useOptimisticCart,
  type OptimisticCartAction,
} from "./use-optimistic-cart";

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

// ────────────────────────────────────────────────────────────────────────────
// Context value

type CartContextValue = {
  summary: CartSummary;
  itemCount: number;
  isHydrating: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (next: boolean) => void;
  modes: CartFulfillmentMode[];
  taxes: PublicTax[];
  tipCents: number;
  setTipCents: (next: number) => void;
  step: CartStep;
  setStep: (next: CartStep) => void;
  dineInLock: { tableLabel: string } | null;
  clearDineInLock: () => void;
  initialModeHint: "pickup" | "delivery" | null;
  placedOrderId: string | null;
  placedOrder: PlacedOrderSnapshot | null;
  isPlacingOrder: boolean;
  addItem: (input: {
    itemId: string;
    variationId?: string;
    quantity?: number;
    name?: string;
    basePriceCents?: number;
    variationName?: string | null;
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
  /** Delta-based stepper. Reads the latest line qty from the optimistic
   *  cart (always derived fresh from server + in-flight actions, so no
   *  stale-closure race) and dispatches an absolute updateQuantity. */
  bumpQuantity: (lineItemId: string, delta: number) => void;
  removeItem: (lineItemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Await all in-flight cart mutations. Called by placeOrder so the
   *  server's view of the cart is complete before the draft → open
   *  transition fires. */
  flush: () => Promise<void>;
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

/** Per-action idempotency key. UUID when crypto.randomUUID is available;
 *  fallback for ancient browsers. Server's withIdempotency wrapper caches
 *  the result for 24h, so the same key returned twice produces one DB
 *  write — the dedup contract every mutation in this file relies on. */
function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Provider

type CartProviderProps = {
  orgId: string;
  venueId: string;
  catalogPath: string;
  modes: CartFulfillmentMode[];
  taxes?: PublicTax[];
  initialSummary?: CartSummary;
  children: ReactNode;
};

/**
 * Hydrogen-style cart provider (KRA-108).
 *
 * Three layers of state:
 *   1. `serverCart` — last known canonical cart from the server
 *   2. `optimisticCart` — `serverCart` + replay of in-flight optimistic
 *      actions, derived fresh every render via `useOptimisticCart`
 *   3. Pending promise set — tracked so `flush()` can await them all
 *      before `placeOrder` commits the draft
 *
 * Each cart mutation:
 *   - Generates `crypto.randomUUID()` as idempotency key
 *   - `startTransition` → `addOptimistic` for instant UI
 *   - Calls the server action with the key
 *   - `setServerCart(result)` — React clears this transition's optimistic
 *      AND commits the new server state in one tick (no double-count)
 *
 * The server's `withIdempotency()` wrapper (lib/cart/idempotency.ts)
 * caches the result per key, so duplicate dispatches (multi-tab,
 * strict-mode double-invoke, browser refresh during in-flight) return
 * the cached cart instead of re-executing the mutation.
 */
export function CartProvider({
  orgId,
  venueId,
  catalogPath,
  modes,
  taxes = [],
  initialSummary,
  children,
}: CartProviderProps) {
  // ── Cart state (the actual refactored thing) ──────────────────────────
  const [serverCart, setServerCart] = useState<CartSummary>(
    initialSummary ?? EMPTY_SUMMARY,
  );
  const [optimisticCart, addOptimistic] = useOptimisticCart(serverCart);
  const [, startTransition] = useTransition();

  // Track in-flight mutation promises so flush() can await them before
  // placeOrder commits. A WeakRef-free Set keeps this simple; each entry
  // self-removes in the action's finally clause.
  const pendingPromisesRef = useRef<Set<Promise<unknown>>>(new Set());

  // Identity cache — bootstrap once, reuse for every mutation. Skips
  // ~200-400ms of auth.getUser() + customers SELECT per call on dev.
  // Forged hints are RLS-safe (server scopes by auth.uid()).
  const identityRef = useRef<CartIdentity | null>(null);

  // Hydration state: true until the first server roundtrip lands. Only
  // matters when initialSummary wasn't passed (no SSR cart preload).
  const [isHydrating, setIsHydrating] = useState(!initialSummary);

  // One-time mount: identity bootstrap + initial cart fetch in parallel.
  // No drain loop, no localStorage cache hydration, no race-aware
  // filter — the v1 cart machinery is gone.
  const hasBootstrappedRef = useRef(false);
  useEffect(() => {
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;

    // Identity: fire-and-forget. If it lands before the first mutation,
    // we save a round-trip; if not, the mutation falls back to
    // server-side ensureCartIdentity.
    ensureCartIdentityAction(orgId)
      .then((id) => {
        identityRef.current = id;
      })
      .catch(() => {
        // Silent — mutations work without the cached identity (slower).
      });

    // Skip the initial fetch if SSR pre-populated the cart.
    if (initialSummary) {
      setIsHydrating(false);
      return;
    }

    getCartSummaryAction({ orgId, venueId })
      .then((next) => setServerCart(next))
      .catch(() => {
        // Silent — cart stays empty. User can still add items; the
        // first mutation will populate state from its return value.
      })
      .finally(() => setIsHydrating(false));
  }, [initialSummary, orgId, venueId]);

  // ── Mutation helpers ──────────────────────────────────────────────────
  //
  // Pattern (used by every action below):
  //   1. crypto.randomUUID() per logical user action
  //   2. startTransition(async () => {
  //        addOptimistic({...})           ← instant UI, in dispatch order
  //        await mutationLockRef.current  ← serialize the SERVER CALL only
  //        const next = await serverCall()
  //        setServerCart(next)            ← React clears this transition's
  //                                          optimistic + commits server in one tick
  //      })
  //
  // Why the lock (KRA-108 auto-add bug, 2026-05-27): without it, rapid
  // taps fire concurrent server calls. Responses arrive in unpredictable
  // order due to network jitter — and each response is the cart state at
  // its commit moment. When `setServerCart` lands with state that already
  // reflects siblings' commits, useOptimistic re-derives by re-applying
  // still-pending optimistic actions on top → phantom qty overshoot
  // (taps=3, server qty=3, UI briefly flashes 4 or 5). Serializing the
  // server call eliminates the out-of-order arrival; the optimistic UI
  // stays instant because addOptimistic still fires before the lock await.
  //
  // Idempotency keys at the server side still close any retry/replay
  // duplicates the lock doesn't cover (multi-tab, refresh-mid-flight).

  const mutationLockRef = useRef<Promise<void>>(Promise.resolve());

  const runMutation = useCallback(
    <T,>(opts: {
      optimistic: OptimisticCartAction;
      serverCall: () => Promise<T>;
      onError?: (err: unknown) => void;
    }) => {
      // Chain this mutation's server call onto the lock BEFORE entering
      // the transition. Two reasons it has to be sync at dispatch time:
      // (1) two near-simultaneous taps both reading `mutationLockRef.current`
      // inside their async transitions could see the SAME prior promise
      // and serialize against IT instead of each other — defeating the
      // chain. (2) The lock has to advance in dispatch order, which is
      // the order React fires startTransition callbacks; doing the swap
      // synchronously here pins that order.
      const prior = mutationLockRef.current;
      let releaseLock!: () => void;
      mutationLockRef.current = new Promise<void>((r) => {
        releaseLock = r;
      });

      startTransition(async () => {
        addOptimistic(opts.optimistic);
        try {
          await prior;
          const promise = opts.serverCall();
          pendingPromisesRef.current.add(promise);
          try {
            const next = (await promise) as unknown as CartSummary;
            setServerCart(next);
          } finally {
            pendingPromisesRef.current.delete(promise);
          }
        } catch (err) {
          opts.onError?.(err);
        } finally {
          releaseLock();
        }
      });
    },
    [addOptimistic],
  );

  // Toast wrapper used by all mutation onError paths. Pulls the latest
  // translator from the ref so re-renders don't force a callback rebuild.
  const onMutationError = useCallback((err: unknown) => {
    toast.error(
      err instanceof Error
        ? err.message
        : tRef.current("errors.cart_save_failed"),
    );
  }, []);

  const addItem: CartContextValue["addItem"] = useCallback(
    async ({
      itemId,
      variationId,
      quantity = 1,
      name,
      basePriceCents = 0,
      variationName = null,
      modifiers,
    }) => {
      const idempotencyKey = newIdempotencyKey();
      // Allocate the placeholder id HERE (once per tap) rather than
      // inside the optimistic reducer. useOptimistic re-runs the
      // reducer on every render — and under StrictMode it runs twice
      // per render in dev — so generating crypto.randomUUID() inside
      // the reducer would produce a different placeholder id on every
      // render. React's list reconciliation keys off `id`, so the
      // placeholder line would unmount/remount every frame the add is
      // in flight, visibly flickering and tearing down any animation
      // mid-flight. The action carries the id so the reducer can stay
      // a pure function.
      const placeholderId =
        "local-" +
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2));

      const resolvedName = name ?? tRef.current("add_to_cart.adding");
      const modifierSelections = toModifierSelections(modifiers);
      const lineModifiers: CartLineItemModifier[] = (modifiers ?? []).map(
        (m, index) => ({
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

      runMutation({
        optimistic: {
          type: "add",
          itemId,
          variationId: variationId ?? null,
          quantity,
          name: resolvedName,
          variationName,
          basePriceCents,
          modifiers: lineModifiers,
          modifierSig: sig,
          idempotencyKey,
          placeholderId,
        },
        serverCall: () =>
          addLineItemAction({
            orgId,
            venueId,
            itemId,
            variationId,
            quantity,
            modifiers: modifierSelections,
            catalogPath,
            identity: identityRef.current ?? undefined,
            idempotencyKey,
          }),
        onError: onMutationError,
      });
    },
    [catalogPath, orgId, runMutation, venueId],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    async (lineItemId, quantity) => {
      const idempotencyKey = newIdempotencyKey();

      runMutation({
        optimistic: { type: "updateQuantity", lineItemId, quantity, idempotencyKey },
        serverCall: () =>
          updateLineItemQuantityAction({
            orgId,
            venueId,
            lineItemId,
            quantity,
            catalogPath,
            identity: identityRef.current ?? undefined,
            orderId: serverCart.orderId ?? undefined,
            idempotencyKey,
          }),
        onError: onMutationError,
      });
    },
    [catalogPath, orgId, runMutation, serverCart.orderId, venueId],
  );

  const bumpQuantity: CartContextValue["bumpQuantity"] = useCallback(
    (lineItemId, delta) => {
      // Read latest qty from optimistic cart so two rapid taps in the
      // same render don't both compute the same target. Without
      // useOptimistic, this would need a ref; with it, optimisticCart
      // is always fresh because it derives from server + in-flight
      // optimistic actions.
      const line = optimisticCart.lineItems.find((l) => l.id === lineItemId);
      if (!line) return;

      // Local placeholder: the originating addItem's server roundtrip
      // is still in flight, so the line doesn't have a real DB uuid
      // yet. Firing updateQuantity / removeItem with `lineItemId`
      // would send the client-generated `local-<uuid>` string to
      // Postgres, which rejects it as invalid uuid syntax (toast:
      // 'invalid input syntax for type uuid'). Route through addItem
      // for positive deltas: the reducer's tuple match (item,
      // variation, sig) bumps the placeholder optimistically, and
      // server-side dedup merges each +1 add onto whichever line the
      // original add is about to materialize.
      //
      // Negative deltas on a placeholder are deliberately a no-op for
      // now — they require a deferred-remove flow that fires once the
      // placeholder materializes (TODO: track pending bumps per local
      // id, apply against the real line id when setServerCart lands).
      // Silent skip beats a uuid error toast; the customer can tap −
      // again the moment the placeholder converts.
      if (line.id.startsWith("local-")) {
        if (delta > 0 && line.catalog_item_id) {
          void addItem({
            itemId: line.catalog_item_id,
            variationId: line.catalog_variation_id ?? undefined,
            quantity: delta,
            name: line.name,
            basePriceCents: line.base_price_cents,
            variationName: line.variation_name,
            modifiers: line.modifiers
              .filter((m) => m.catalog_modifier_list_id !== null)
              .map((m) => ({
                modifierListId: m.catalog_modifier_list_id as string,
                modifierId: m.catalog_modifier_id,
                quantity: m.quantity,
                name: m.name,
                basePriceCentsDelta: m.base_price_cents_delta,
                text_value: m.text_value,
              })),
          });
        }
        return;
      }

      const next = line.quantity + delta;
      if (next <= 0) {
        void removeItem(lineItemId);
      } else {
        void updateQuantity(lineItemId, next);
      }
    },
    // addItem/updateQuantity/removeItem are stable; optimisticCart
    // updates per render so the closure sees latest line state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optimisticCart, addItem, updateQuantity],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    async (lineItemId) => {
      const idempotencyKey = newIdempotencyKey();

      runMutation({
        optimistic: { type: "remove", lineItemId, idempotencyKey },
        serverCall: () =>
          removeLineItemAction({
            orgId,
            venueId,
            lineItemId,
            catalogPath,
            identity: identityRef.current ?? undefined,
            orderId: serverCart.orderId ?? undefined,
            idempotencyKey,
          }),
        onError: onMutationError,
      });
    },
    [catalogPath, orgId, runMutation, serverCart.orderId, venueId],
  );

  const clear: CartContextValue["clear"] = useCallback(async () => {
    const idempotencyKey = newIdempotencyKey();

    runMutation({
      optimistic: { type: "clear", idempotencyKey },
      serverCall: () =>
        clearCartAction({
          orgId,
          venueId,
          catalogPath,
          identity: identityRef.current ?? undefined,
          orderId: serverCart.orderId ?? undefined,
          idempotencyKey,
        }),
      onError: onMutationError,
    });
  }, [
    catalogPath,
    onMutationError,
    orgId,
    runMutation,
    serverCart.orderId,
    venueId,
  ]);

  const refresh: CartContextValue["refresh"] = useCallback(async () => {
    try {
      const next = await getCartSummaryAction({
        orgId,
        venueId,
        identity: identityRef.current ?? undefined,
        orderId: serverCart.orderId ?? undefined,
      });
      setServerCart(next);
    } catch {
      // Silent — refresh is best-effort. The cart still has its last
      // known state; the next mutation's response will hydrate fresh.
    }
  }, [orgId, serverCart.orderId, venueId]);

  const flush: CartContextValue["flush"] = useCallback(async () => {
    const pending = [...pendingPromisesRef.current];
    if (pending.length === 0) return;
    await Promise.allSettled(pending);
  }, []);

  // ── Sister state (preserved from pre-v2) ──────────────────────────────

  const [isOpen, setIsOpen] = useState(false);
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

  // QR-driven dine-in lock — unchanged from pre-v2. See git history for the
  // full source-of-truth-chain comment (?qr= → ?mode= → sessionStorage → free).
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
          // ignore
        }
      } else if (modeParam === "pickup" || modeParam === "delivery") {
        setDineInLock(null);
        setInitialModeHint(modeParam);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      } else if (hasFreshScan) {
        setDineInLock(null);
        setInitialModeHint(null);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      }

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
          // ignore
        }
      }
      return;
    }

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { tableLabel?: unknown };
        if (typeof parsed.tableLabel === "string" && parsed.tableLabel) {
          setDineInLock({ tableLabel: parsed.tableLabel });
        }
      }
    } catch {
      // ignore
    }
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
  const tRef = useRef<(key: StorefrontMessageKey) => string>(() => "");
  tRef.current = (key) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });

  // Reset tip when cart empties so a leftover tip from a placed order
  // doesn't apply to a fresh cart.
  useEffect(() => {
    if (optimisticCart.lineItems.length === 0) setTipCents(0);
  }, [optimisticCart.lineItems.length]);

  // ── placeOrder — preserved from pre-v2 ────────────────────────────────

  const placeInFlightRef = useRef(false);

  const placeOrder: CartContextValue["placeOrder"] = useCallback(
    async (input) => {
      if (placeInFlightRef.current) {
        return { ok: false, error: "already_placing" } as const;
      }
      placeInFlightRef.current = true;
      setIsPlacingOrder(true);
      try {
        // Wait for any in-flight cart mutations to land server-side
        // before transitioning the order. Without this, late adds could
        // race the place and end up on a different (new) draft.
        await flush();

        const result = await placeOrderAction({
          orgId,
          venueId,
          catalogPath,
          tipCents,
          ...input,
        } as Parameters<typeof placeOrderAction>[0]);

        const snapshotBase = {
          orderId: result.orderId,
          lineItems: optimisticCart.lineItems,
          subtotalCents: optimisticCart.subtotalCents,
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
        // Reset cart to empty — the draft is now in state='open', the
        // existing draft order is gone. The next addItem will create a
        // fresh draft.
        setServerCart(EMPTY_SUMMARY);
        return { ok: true } as const;
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : null;
        const knownCodes: Record<string, StorefrontMessageKey> = {
          tip_too_high: "errors.tip_too_high",
          tip_without_items: "errors.tip_without_items",
          phone_invalid: "errors.phone_invalid",
          cart_empty: "errors.cart_empty",
          scheduled_time_too_soon: "errors.scheduled_time_too_soon",
          order_expired: "errors.order_expired",
          table_session_expired: "errors.table_session_expired",
        };
        let message: string;
        if (rawMessage && rawMessage.startsWith("price_changed")) {
          const names = rawMessage.split(":")[1]?.trim() || "";
          message = tRef.current("errors.price_changed").replace(
            /\{name\}/g,
            names,
          );
          refresh().catch(() => {
            /* noop */
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
      optimisticCart.lineItems,
      optimisticCart.subtotalCents,
      orgId,
      refresh,
      tipCents,
      venueId,
    ],
  );

  // ── Context value ─────────────────────────────────────────────────────

  const itemCount = optimisticCart.lineItems.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  const value = useMemo<CartContextValue>(
    () => ({
      summary: optimisticCart,
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
      optimisticCart,
      placeOrder,
      placedOrder,
      placedOrderId,
      refresh,
      removeItem,
      step,
      taxes,
      tipCents,
      updateQuantity,
    ],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

// ────────────────────────────────────────────────────────────────────────────
// Hooks

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
 * which is reachable from preview routes that have no cart provider).
 */
export function useOptionalCart(): CartContextValue | null {
  return use(CartContext);
}
