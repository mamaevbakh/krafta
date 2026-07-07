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
  ensureCartIdentityAction,
  getCartSummaryAction,
  placeOrderAction,
  upsertCartLinesAction,
} from "@/lib/cart/actions";
import type { CartIdentity } from "@/lib/cart/identity";
import {
  lineKeyFromServerLine,
  makeLineKey,
  type LineKey,
} from "@/lib/cart/line-key";
import type {
  CartLineItem,
  CartLineItemModifier,
  CartSummary,
} from "@/lib/cart/orders";
import { modifierSignature } from "@/lib/cart/modifier-signature";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { pinRealtimeAuth } from "@/lib/supabase/realtime";
import { haptic } from "@/lib/telegram/webapp";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import type { PublicTax } from "@/lib/catalogs/types";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";

import {
  applyAction,
  useOptimisticCart,
  type OptimisticCartAction,
  type SetLineTarget,
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
      placedAt: string;
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
      placedAt: string;
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
      placedAt: string;
    };

// ────────────────────────────────────────────────────────────────────────────
// Batch tuning

/**
 * Trailing-edge debounce window for the batch upserter. Every tap on
 * the optimistic cart restarts this timer; when it fires (no new taps
 * for BATCH_WINDOW_MS), the accumulated state ships in one
 * `upsertCartLinesAction` call.
 *
 * Trade-off:
 *   - Lower (~150ms): less delay before the server first hears about
 *     a single tap. Rapid taps still collapse, but the first tap of
 *     a sequence holds optimistic state for less time before being
 *     persisted — better for refresh-recovery, slightly worse for
 *     coalesce ratio.
 *   - Higher (~500ms): more rapid taps absorbed per batch, better
 *     server throughput, but the first tap waits longer before
 *     hitting the server. Customer refresh during the window loses
 *     more state.
 *
 * 250ms is the launch default. Env-tunable for ops.
 */
const DEFAULT_BATCH_WINDOW_MS = 250;

function resolveBatchWindowMs(): number {
  if (typeof process !== "undefined") {
    const raw =
      process.env.NEXT_PUBLIC_CART_BATCH_WINDOW_MS ??
      process.env.CART_BATCH_WINDOW_MS;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < 5000) {
        return parsed;
      }
    }
  }
  return DEFAULT_BATCH_WINDOW_MS;
}

const BATCH_WINDOW_MS = resolveBatchWindowMs();

/** Hard ceiling on flush() drain iterations. New taps arriving during
 *  a batch in-flight count as a follow-up flush; we drain in a loop
 *  but bail if taps keep coming indefinitely (UI shouldn't allow it). */
const FLUSH_MAX_ITERATIONS = 5;

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
    /** The item's resolved default variation id, threaded from the
     *  catalog. Required when `variationId` is missing (catalog-card
     *  Add path). The placeholder's lineKey is constructed from one
     *  of these so the client and server lineKeys converge by
     *  construction — no flicker on first server response. */
    defaultVariationId?: string;
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
  /** Delta-based stepper. Reads latest qty from optimisticCartRef
   *  (synchronously advanced per tap), routes through the batch
   *  scheduler. */
  bumpQuantity: (lineItemId: string, delta: number) => void;
  removeItem: (lineItemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Await all in-flight cart batches + drain any pending taps. Called
   *  by placeOrder so the server's view of the cart is complete
   *  before the draft → open transition fires. */
  flush: () => Promise<void>;
  placeOrder: (
    input:
      | {
          mode: "dine_in";
          fields: { tableLabel: string };
          paymentMethod?: "cash" | "card";
        }
      | {
          mode: "pickup";
          fields: {
            scheduleType: "asap" | "scheduled";
            pickupAt: string | null;
            recipientName: string | null;
            recipientPhone: string | null;
            note: string | null;
          };
          paymentMethod?: "cash" | "card";
        }
      | {
          mode: "delivery";
          fields: {
            address: string;
            latitude: number | null;
            longitude: number | null;
            district: string | null;
            street: string | null;
            building: string | null;
            recipientName: string;
            recipientPhone: string;
            scheduledFor: string | null;
            note: string | null;
          };
          paymentMethod?: "cash" | "card";
        },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Reset cart-session guards (`placedRef`, drawer state) so the
   *  next customer interaction creates a fresh draft. Wired into
   *  `close()` and `setStep` transitions away from "placed" — most
   *  callers don't need this directly, but exposed for explicit
   *  control from any "start a new order" UI. */
  resetForNewCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_SUMMARY: CartSummary = {
  orderId: null,
  version: 0,
  lineItems: [],
  subtotalCents: 0,
};

/**
 * Rewrite each server line's `id` to its tuple-derived `lineKey`
 * BEFORE the cart enters React state. Stable identity from the moment
 * the line lands client-side; React keys off it cleanly.
 */
function normalizeSummary(summary: CartSummary): CartSummary {
  return {
    ...summary,
    lineItems: summary.lineItems.map((line) => {
      if (!line.catalog_item_id || !line.catalog_variation_id) return line;
      return { ...line, id: lineKeyFromServerLine(line) };
    }),
  };
}

/** Per-action idempotency key. UUID when crypto.randomUUID is available;
 *  fallback for ancient browsers. Server's withIdempotency wrapper caches
 *  the result for 24h, so the same key returned twice produces one DB
 *  write — the dedup contract every batch flush attempt relies on. */
function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Per-tap action id — purely informational, for trace logging. */
function newActionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `act-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Heuristic for transient failures that benefit from retry. Network-
 * layer faults manifest as TypeError("Failed to fetch") or messages
 * mentioning network/timeout/abort. Server-side validation errors
 * (item_not_found, variation_not_found, modifier_invalid) are terminal
 * — they surface to the toast and trigger a refresh().
 */
function isRetryableMutationError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    if (message.includes("network")) return true;
    if (message.includes("fetch")) return true;
    if (message.includes("timeout")) return true;
    if (message.includes("aborted")) return true;
  }
  return false;
}

/**
 * Retry a cart batch with exponential-ish backoff on transient
 * failures. Backoff schedule 200ms → 500ms → 1500ms (4 attempts total
 * worst case). The same idempotency key is reused on retries — server
 * dedup short-circuits if the first attempt actually landed.
 */
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [200, 500, 1500];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= delays.length) break;
      if (!isRetryableMutationError(err)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw lastErr;
}

// ────────────────────────────────────────────────────────────────────────────
// Batch state machine

/** One pending entry per lineKey, drained into the next batch flush
 *  payload. Carries enough metadata to address the server's RPC even
 *  when the entry is a delete (qty=0) — the modifier list / variation
 *  has to be resolvable from the entry alone, since the optimistic
 *  state has already dropped the line by the time the flush fires. */
type PendingBatchEntry = {
  itemId: string;
  variationId: string;
  qty: number;
  modifiers: Array<{
    modifierListId: string;
    modifierId: string | null;
    quantity: number;
    text_value: string | null;
  }>;
};

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
 * cart-v3 batch-debounced cart provider.
 *
 * Optimistic UI is per-tap (every tap synchronously updates
 * `optimisticCartRef.current` + addOptimistic). Server writes are
 * batched: rapid taps within `BATCH_WINDOW_MS` collapse to a single
 * `upsertCartLinesAction` call carrying the absolute target qty for
 * every line that was touched.
 *
 * The Place Order path awaits `flush()`, which cancels any pending
 * debounce, fires the batch immediately, and awaits the in-flight
 * lock — so placeOrder lands on a server-side cart that fully
 * reflects every tap the customer made.
 *
 * Realtime cross-tab sync filters out self-events via
 * `written_by_client` so a tab's own batch landing doesn't fire a
 * redundant refresh().
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
  // ── Cart state ────────────────────────────────────────────────────────
  const [serverCart, setServerCart] = useState<CartSummary>(
    initialSummary ? normalizeSummary(initialSummary) : EMPTY_SUMMARY,
  );
  const [optimisticCart, addOptimistic] = useOptimisticCart(serverCart);
  const [, startTransition] = useTransition();

  // Live mirror of serverCart for ref-based reads inside flushBatch
  // (which needs the latest committed orderId without depending on
  // serverCart as a useCallback dep).
  const serverCartRef = useRef(serverCart);
  serverCartRef.current = serverCart;

  // Live mirror of optimisticCart. Read at every scheduleSetLine
  // dispatch to compute the absolute targetQty against pending taps.
  // Manually pre-advanced in scheduleSetLine so back-to-back
  // synchronous taps see each other's effects.
  const optimisticCartRef = useRef(optimisticCart);
  optimisticCartRef.current = optimisticCart;

  // ── Identity + clientId ──────────────────────────────────────────────
  const identityRef = useRef<CartIdentity | null>(null);

  /** Per-tab UUID. Generated once at mount, stamped on every server
   *  write so the Realtime subscription can deterministically skip
   *  this tab's own events. */
  const clientIdRef = useRef<string>("");
  if (clientIdRef.current === "") {
    clientIdRef.current = newIdempotencyKey();
  }

  // ── Pending batch state ──────────────────────────────────────────────
  const pendingByLineKey = useRef<Map<LineKey, PendingBatchEntry>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Held while a batch is in-flight. Subsequent flushes await this
   *  to serialize batch dispatch — same semantics as the old
   *  per-tap lock, just at batch granularity. */
  const flushLockRef = useRef<Promise<void>>(Promise.resolve());

  /** Tracks all in-flight batch promises so flush() can await them.
   *  Each runs through the lock chain, but having an explicit set
   *  protects against future code paths that bypass the lock. */
  const pendingPromisesRef = useRef<Set<Promise<unknown>>>(new Set());

  /** Pending startTransition resolvers — one per dispatched optimistic
   *  action. Each scheduleSetLine call creates a Promise that stays
   *  pending (and keeps the transition pending, which is what makes
   *  the optimistic UI visible) until the next batch flush completes.
   *  flushBatch fires every resolver in a single sync loop after
   *  setServerCart commits, so all pending transitions complete
   *  atomically — same tick that the new server state lands, so
   *  useOptimistic re-derives from `serverCart + []` and the
   *  optimistic UI converges to the canonical state without flicker. */
  const pendingTxResolversRef = useRef<Array<() => void>>([]);

  // ── Hydration + Place guards ─────────────────────────────────────────
  const [isHydrating, setIsHydrating] = useState(!initialSummary);
  const isHydratingRef = useRef(isHydrating);
  isHydratingRef.current = isHydrating;

  /** Set true the moment placeOrderAction returns success. Blocks
   *  scheduleSetLine from creating phantom lines on the now-stale
   *  cart between Place success and the placed-screen dismissal.
   *  Cleared by resetForNewCart() (called from close() / setStep
   *  when transitioning away from "placed"). */
  const placedRef = useRef(false);

  // ── Bootstrap ────────────────────────────────────────────────────────
  const hasBootstrappedRef = useRef(false);
  useEffect(() => {
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;

    ensureCartIdentityAction(orgId)
      .then((id) => {
        identityRef.current = id;
      })
      .catch(() => {
        /* Silent — mutations work without the cached identity (slower). */
      });

    if (initialSummary) {
      setIsHydrating(false);
      return;
    }

    getCartSummaryAction({ orgId, venueId })
      .then((next) => setServerCart(normalizeSummary(next)))
      .catch(() => {
        /* Silent — cart stays empty. */
      })
      .finally(() => setIsHydrating(false));
  }, [initialSummary, orgId, venueId]);

  // ── Toast wrapper for batch errors ───────────────────────────────────
  const onMutationError = useCallback((err: unknown) => {
    toast.error(
      err instanceof Error
        ? err.message
        : tRef.current("errors.cart_save_failed"),
    );
  }, []);

  // ── refresh() (Realtime + manual) ────────────────────────────────────
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const refresh: CartContextValue["refresh"] = useCallback(async () => {
    try {
      const next = await getCartSummaryAction({
        orgId,
        venueId,
        identity: identityRef.current ?? undefined,
        orderId: serverCartRef.current.orderId ?? undefined,
      });
      const normalized = normalizeSummary(next);
      serverCartRef.current = normalized;
      setServerCart(normalized);
    } catch {
      /* Silent — refresh is best-effort. */
    }
  }, [orgId, venueId]);
  refreshRef.current = refresh;

  // ── Batch flush ──────────────────────────────────────────────────────

  /** Drain pendingByLineKey into a snapshot payload. The pending map
   *  is cleared atomically so new taps after this point land in the
   *  NEXT batch. */
  const drainPayload = useCallback((): PendingBatchEntry[] => {
    const out: PendingBatchEntry[] = [];
    for (const entry of pendingByLineKey.current.values()) {
      out.push(entry);
    }
    pendingByLineKey.current.clear();
    return out;
  }, []);

  const flushBatch = useCallback(async (): Promise<void> => {
    // Cancel the debounce timer if it's scheduled — we're firing now.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const lines = drainPayload();
    if (lines.length === 0) return;

    // Snapshot the tx-resolvers belonging to THIS batch synchronously
    // — same instant we drain pendingByLineKey. Any tap that lands
    // during the upcoming server round-trip pushes its resolver into
    // a fresh array, and its entry into pendingByLineKey for the
    // NEXT batch. Without this snapshot, batch 1's setServerCart
    // would fire every resolver in the ref, prematurely clearing the
    // in-flight taps' optimistic actions and producing a visible
    // qty regression before batch 2 has a chance to land.
    const myResolvers = pendingTxResolversRef.current;
    pendingTxResolversRef.current = [];

    // Fresh idempotency key per flush attempt. callWithRetry retries
    // with the same key (server dedup); a NEW batch (because more taps
    // came in after this one started) gets its own fresh key.
    const idempotencyKey = newIdempotencyKey();

    const prior = flushLockRef.current;
    let releaseLock!: () => void;
    flushLockRef.current = new Promise<void>((r) => {
      releaseLock = r;
    });

    const batchPromise = (async () => {
      try {
        await prior;
        const result = await callWithRetry(() =>
          upsertCartLinesAction({
            orgId,
            venueId,
            catalogPath,
            clientId: clientIdRef.current,
            lines,
            orderId: serverCartRef.current.orderId ?? undefined,
            identity: identityRef.current ?? undefined,
            idempotencyKey,
          }),
        );
        const normalized = normalizeSummary(result);
        serverCartRef.current = normalized;
        setServerCart(normalized);
      } catch (err) {
        onMutationError(err);
        // Validation failures usually mean the optimistic cart is
        // stale (item was deleted from the catalog, etc). Refresh
        // to re-sync against the server's truth.
        void refresh();
      } finally {
        // Fire only the resolvers we snapshotted — taps that landed
        // during this batch's execution keep their transitions open
        // until the NEXT batch lands. Fired in finally so the
        // optimistic UI can't get stuck on failure either: on success
        // the resolved transitions clear in the same tick as
        // setServerCart (canonical state lands cleanly); on failure
        // the optimistic actions clear and the UI reverts to the last
        // good serverCart (customer sees their taps undo + error toast).
        for (const resolve of myResolvers) resolve();
        releaseLock();
      }
    })();

    pendingPromisesRef.current.add(batchPromise);
    try {
      await batchPromise;
    } finally {
      pendingPromisesRef.current.delete(batchPromise);
    }
  }, [catalogPath, drainPayload, onMutationError, orgId, refresh, venueId]);

  /** Reset/extend the debounce timer. No-op while hydration is in
   *  flight or after a placeOrder (placedRef blocks new schedules
   *  until resetForNewCart fires). */
  const schedule = useCallback(() => {
    if (placedRef.current) return;
    if (isHydratingRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void flushBatch();
    }, BATCH_WINDOW_MS);
  }, [flushBatch]);

  // ── scheduleSetLine — single entry point for every cart mutation ─────
  const scheduleSetLine = useCallback(
    (lineKey: LineKey, target: SetLineTarget | null) => {
      if (placedRef.current) {
        /* Cart is closed for this session — silent drop. The placed
         * screen is a modal so the customer can't actually see a stale
         * stepper to tap; this guard catches the race where a tap
         * was queued in the same event loop as Place succeeded. */
        return;
      }

      // For deletes (target=null), the OPTIMISTIC action only needs the
      // lineKey, but the BATCH PAYLOAD needs the line's metadata
      // (item, variation, modifiers) to address the server-side row.
      // Capture metadata from optimisticCartRef BEFORE the reducer
      // removes the line.
      let batchEntry: PendingBatchEntry | null = null;
      if (target === null) {
        const existing = optimisticCartRef.current.lineItems.find(
          (l) => l.id === lineKey,
        );
        if (existing && existing.catalog_item_id && existing.catalog_variation_id) {
          batchEntry = {
            itemId: existing.catalog_item_id,
            variationId: existing.catalog_variation_id,
            qty: 0,
            modifiers: existing.modifiers
              .filter((m) => m.catalog_modifier_list_id !== null)
              .map((m) => ({
                modifierListId: m.catalog_modifier_list_id as string,
                modifierId: m.catalog_modifier_id,
                quantity: m.quantity,
                text_value: m.text_value,
              })),
          };
        }
        /* No existing line → no batch entry needed; the optimistic
         * delete is a no-op on the reducer side too. */
      } else {
        batchEntry = {
          itemId: target.itemId,
          variationId: target.variationId,
          qty: target.qty,
          modifiers: target.modifiers
            .filter((m) => m.catalog_modifier_list_id !== null)
            .map((m) => ({
              modifierListId: m.catalog_modifier_list_id as string,
              modifierId: m.catalog_modifier_id,
              quantity: m.quantity,
              text_value: m.text_value,
            })),
        };
      }

      // Build + dispatch the optimistic action. The transition stays
      // pending until the next batch flush completes — without that,
      // a sync `startTransition(() => addOptimistic(action))` returns
      // immediately, React commits the transition (clearing the
      // optimistic action), and the optimistic UI never renders. The
      // tx resolver pushed below fires from flushBatch's setServerCart
      // path, so the optimistic clears in the same tick the new server
      // state commits.
      const action: OptimisticCartAction = {
        type: "setLine",
        lineKey,
        target,
        actionId: newActionId(),
      };
      startTransition(async () => {
        addOptimistic(action);
        await new Promise<void>((resolve) => {
          pendingTxResolversRef.current.push(resolve);
        });
      });
      // Synchronously advance the ref — rapid synchronous taps in the
      // same event-loop iteration read this updated value when computing
      // their own next target.
      optimisticCartRef.current = applyAction(
        optimisticCartRef.current,
        action,
      );

      // Update the pending batch entry for this lineKey. Coalesce:
      // multiple taps on the same lineKey collapse to the LATEST
      // target. A delete after a pending insert wipes the insert.
      if (batchEntry) {
        pendingByLineKey.current.set(lineKey, batchEntry);
      } else {
        pendingByLineKey.current.delete(lineKey);
      }

      schedule();
    },
    [addOptimistic, schedule],
  );

  // ── Public mutation API ──────────────────────────────────────────────

  const addItem: CartContextValue["addItem"] = useCallback(
    async ({
      itemId,
      variationId,
      defaultVariationId,
      quantity = 1,
      name,
      basePriceCents = 0,
      variationName = null,
      modifiers,
    }) => {
      const resolvedVariationId = variationId ?? defaultVariationId ?? null;
      if (!resolvedVariationId) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[cart] addItem called without variationId or defaultVariationId",
            { itemId },
          );
        }
        return;
      }
      // Native tap feedback inside Telegram (no-op on the web).
      haptic.impact("light");

      const resolvedName = name ?? tRef.current("add_to_cart.adding");
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
      const sig = modifierSignature(
        (modifiers ?? []).map((m) => ({
          listId: m.modifierListId,
          modifierId: m.modifierId,
          quantity: m.quantity,
          text_value: m.text_value,
        })),
      );
      const lineKey = makeLineKey(itemId, resolvedVariationId, sig);

      // Read the LATEST optimistic qty for this line and add the
      // delta. Reading from the ref (not React state) means rapid
      // synchronous taps see each other's effects.
      const existing = optimisticCartRef.current.lineItems.find(
        (l) => l.id === lineKey,
      );
      const targetQty = (existing?.quantity ?? 0) + quantity;

      const modifierDeltaSum = lineModifiers.reduce(
        (sum, m) => sum + m.base_price_cents_delta * m.quantity,
        0,
      );
      const perUnitCents = basePriceCents + modifierDeltaSum;

      scheduleSetLine(lineKey, {
        qty: targetQty,
        itemId,
        variationId: resolvedVariationId,
        name: resolvedName,
        variationName,
        basePriceCents,
        perUnitCents,
        modifiers: lineModifiers,
        modifierSig: sig,
      });
    },
    [scheduleSetLine],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    async (lineItemId, quantity) => {
      const line = optimisticCartRef.current.lineItems.find(
        (l) => l.id === lineItemId,
      );
      if (!line || !line.catalog_item_id || !line.catalog_variation_id) return;

      if (quantity <= 0) {
        scheduleSetLine(lineItemId, null);
        return;
      }

      const modifierDeltaSum = line.modifiers.reduce(
        (sum, m) => sum + m.base_price_cents_delta * m.quantity,
        0,
      );
      const perUnitCents = line.base_price_cents + modifierDeltaSum;
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

      scheduleSetLine(lineItemId, {
        qty: quantity,
        itemId: line.catalog_item_id,
        variationId: line.catalog_variation_id,
        name: line.name,
        variationName: line.variation_name,
        basePriceCents: line.base_price_cents,
        perUnitCents,
        modifiers: line.modifiers,
        modifierSig: sig,
      });
    },
    [scheduleSetLine],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    async (lineItemId) => {
      scheduleSetLine(lineItemId, null);
    },
    [scheduleSetLine],
  );

  const bumpQuantity: CartContextValue["bumpQuantity"] = useCallback(
    (lineItemId, delta) => {
      // Read the latest qty from the REF (synchronously pre-advanced
      // per tap). Two rapid taps in the same render see each other's
      // effects and compute distinct targets.
      const line = optimisticCartRef.current.lineItems.find(
        (l) => l.id === lineItemId,
      );
      if (!line) return;
      haptic.selection();

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
    // Schedule a delete for every line currently in optimistic state.
    // Each lands in pendingByLineKey as a separate entry, drained
    // together in the next batch flush.
    const lines = [...optimisticCartRef.current.lineItems];
    for (const line of lines) {
      scheduleSetLine(line.id, null);
    }
  }, [scheduleSetLine]);

  // ── flush — used by placeOrder and visibility/unload handlers ────────
  const flush: CartContextValue["flush"] = useCallback(async () => {
    // Drain any pending taps into batches. We loop because new taps
    // can land while a batch is in-flight (UI shouldn't allow this
    // post-Place, but be defensive against race conditions).
    for (let i = 0; i < FLUSH_MAX_ITERATIONS; i++) {
      if (pendingByLineKey.current.size === 0 && debounceRef.current === null) {
        break;
      }
      await flushBatch();
    }
    // Await the lock head so any batches dispatched outside flush()
    // (e.g. a debounce that fired while flush was working) settle.
    await flushLockRef.current;

    // Then drain any tracked promises that bypassed the lock (defense
    // in depth — currently nothing does this, but cheap insurance).
    const pending = [...pendingPromisesRef.current];
    if (pending.length === 0) return;
    await Promise.allSettled(pending);
  }, [flushBatch]);

  // ── Realtime cross-tab sync ─────────────────────────────────────────
  useEffect(() => {
    const orderId = serverCart.orderId;
    if (!orderId) return;

    const supabase = createBrowserClient();
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await pinRealtimeAuth(supabase);
      if (cancelled) return;

      channelRef = supabase
        .channel(`cart:${orderId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "commerce",
            table: "order_line_items",
            filter: `order_id=eq.${orderId}`,
          },
          (payload) => {
            // Self-event filter: skip events this tab wrote. The
            // batch RPC stamps `written_by_client = clientIdRef.current`
            // on every INSERT/UPDATE. DELETE events carry only `old`,
            // which inherits whichever client stamped the row last.
            // If the last writer is this tab, skip. If it was another
            // tab, refresh — even if we initiated the actual delete,
            // catching up to server state via refresh is harmless.
            const newRow = (payload as { new?: { written_by_client?: string } })
              .new;
            const oldRow = (payload as { old?: { written_by_client?: string } })
              .old;
            const writtenBy =
              newRow?.written_by_client ?? oldRow?.written_by_client ?? null;
            if (writtenBy && writtenBy === clientIdRef.current) {
              return;
            }
            void refreshRef.current();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channelRef) void supabase.removeChannel(channelRef);
    };
  }, [serverCart.orderId]);

  // ── Visibility + unload flushing ─────────────────────────────────────
  // Background tabs throttle setTimeout (iOS Safari ≥1s minimum), so a
  // pending debounce can stall indefinitely. Flush eagerly on
  // backgrounding / unload so cross-tab sync stays within ~1s and
  // closing the tab mid-burst best-effort persists everything.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    };
    const onPageHide = () => {
      void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  // ── Sister state (drawer + place + dine-in lock) ─────────────────────

  // Persisted placed-state survives router-refresh remounts. After
  // placeOrderAction calls revalidatePath(catalogPath), Next 16 auto-
  // refreshes the router; if the cart-provider remounts in the brief
  // window where the placed step is showing, the customer would
  // briefly see "Order placed" flash then snap to the empty cart on
  // remount. sessionStorage gives us a one-render hop to restore.
  //
  // Cleared by resetForNewCart() — i.e., the customer dismissing the
  // placed step ("Done") or moving back to the cart ("Order more").
  // Reads happen client-side only; hydration runs in an effect, not
  // initial state, so SSR HTML stays cart-default and matches.
  const PLACED_STORAGE_KEY = `krafta.cart.placed.${venueId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStepInternal] = useState<CartStep>("cart");
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

  // Restore the placed snapshot on mount if one was persisted in this
  // session. Without this, the revalidatePath that placeOrderAction
  // fires can race the placed-step render — the customer sees "Order
  // placed" for ~50ms, then the provider remounts and the drawer snaps
  // back to the empty-cart state. The persist + restore pair survives
  // the remount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(PLACED_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        placedOrder: PlacedOrderSnapshot;
        placedOrderId: string;
        isOpen: boolean;
      };
      if (!parsed.placedOrder || !parsed.placedOrderId) return;
      setPlacedOrder(parsed.placedOrder);
      setPlacedOrderId(parsed.placedOrderId);
      setStepInternal("placed");
      placedRef.current = true;
      if (parsed.isOpen) setIsOpen(true);
    } catch {
      // Corrupted JSON / sessionStorage disabled — silently drop.
    }
    // Intentionally only runs once on mount; setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the persisted snapshot's `isOpen` in sync with live state so
  // a swipe-down dismissal on the placed step doesn't get undone by a
  // subsequent remount restoring the drawer back to open. We only
  // touch the existing entry; we don't create one if the customer
  // isn't in the placed flow.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (step !== "placed") return;
    try {
      const raw = sessionStorage.getItem(PLACED_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { isOpen?: boolean };
      if (parsed.isOpen === isOpen) return;
      sessionStorage.setItem(
        PLACED_STORAGE_KEY,
        JSON.stringify({ ...parsed, isOpen }),
      );
    } catch {
      /* noop */
    }
  }, [PLACED_STORAGE_KEY, isOpen, step]);

  const resetForNewCart = useCallback(() => {
    placedRef.current = false;
    setPlacedOrderId(null);
    setPlacedOrder(null);
    setStepInternal("cart");
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(PLACED_STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  }, [PLACED_STORAGE_KEY]);

  // Wrap setStep so transitions OUT of "placed" automatically clear
  // the placedRef guard. The placed step's "Back to menu" CTA calls
  // setStep("cart") which routes through this. We also clear the
  // sessionStorage persisted snapshot so a subsequent remount doesn't
  // pull the customer back into "placed" against their explicit move.
  const setStep = useCallback(
    (next: CartStep) => {
      if (step === "placed" && next !== "placed") {
        placedRef.current = false;
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem(PLACED_STORAGE_KEY);
          } catch {
            /* noop */
          }
        }
      }
      setStepInternal(next);
    },
    [PLACED_STORAGE_KEY, step],
  );

  // Wrap close() so closing from the "placed" step resets the
  // session — same effect as resetForNewCart for the dismissal path.
  const close = useCallback(() => {
    if (step === "placed") {
      resetForNewCart();
    }
    setIsOpen(false);
  }, [resetForNewCart, step]);

  // QR-driven dine-in lock — unchanged from pre-batch.
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

  // Reset tip when the cart empties so a leftover tip doesn't apply
  // to a fresh cart.
  useEffect(() => {
    if (optimisticCart.lineItems.length === 0) setTipCents(0);
  }, [optimisticCart.lineItems.length]);

  // After hydration completes, if any taps landed while isHydrating
  // was true (rare with SSR — only happens for cold-cache visitors
  // who tapped during the bootstrap fetch), kick off the debounce
  // timer to drain them.
  useEffect(() => {
    if (!isHydrating && pendingByLineKey.current.size > 0) {
      schedule();
    }
  }, [isHydrating, schedule]);

  // ── placeOrder ───────────────────────────────────────────────────────
  const placeInFlightRef = useRef(false);

  const placeOrder: CartContextValue["placeOrder"] = useCallback(
    async (input) => {
      if (placeInFlightRef.current) {
        return { ok: false, error: "already_placing" } as const;
      }
      placeInFlightRef.current = true;
      setIsPlacingOrder(true);
      try {
        // Drain pending batches + await in-flight before transitioning
        // the draft. Without this, late taps could race the place and
        // end up on a different (new) draft.
        await flush();

        const result = await placeOrderAction({
          orgId,
          venueId,
          catalogPath,
          tipCents,
          ...input,
        } as Parameters<typeof placeOrderAction>[0]);

        // Card (Krafta Pay): the order is placed with a pending online payment.
        // Hand the customer to the hosted pay page; on success it redirects back
        // to /pay/return, which confirms + settles. Skip the placed step.
        if (result.payUrl) {
          if (typeof window !== "undefined") {
            window.location.assign(result.payUrl);
          }
          return { ok: true } as const;
        }
        // Card was requested but Krafta Pay was unavailable → placed as cash.
        if (result.cardFallbackToCash) {
          toast.message(tRef.current("checkout.card_unavailable_cash"));
        }

        const snapshotBase = {
          orderId: result.orderId,
          lineItems: optimisticCart.lineItems,
          subtotalCents: optimisticCart.subtotalCents,
          tipCents,
          placedAt: new Date().toISOString(),
        };
        const snapshot: PlacedOrderSnapshot =
          input.mode === "dine_in"
            ? { ...snapshotBase, mode: "dine_in", fields: input.fields }
            : input.mode === "pickup"
              ? { ...snapshotBase, mode: "pickup", fields: input.fields }
              : { ...snapshotBase, mode: "delivery", fields: input.fields };

        setPlacedOrder(snapshot);
        setPlacedOrderId(result.orderId);
        // Mark the cart closed for this session — blocks scheduleSetLine
        // from creating phantom lines on a new draft while the placed
        // screen is showing. resetForNewCart() clears it on dismiss.
        placedRef.current = true;
        setStepInternal("placed");
        // Success buzz at the climax of the flow (no-op on the web).
        haptic.notify("success");
        setServerCart(EMPTY_SUMMARY);
        serverCartRef.current = EMPTY_SUMMARY;
        // Persist the placed snapshot so a router-refresh remount (Next
        // 16 auto-refreshes after the revalidatePath fired inside
        // placeOrderAction) restores the placed step on the next mount
        // instead of snapping back to the empty cart.
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              PLACED_STORAGE_KEY,
              JSON.stringify({
                placedOrder: snapshot,
                placedOrderId: result.orderId,
                isOpen: true,
              }),
            );
          } catch {
            /* noop */
          }
        }
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
      close,
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
      resetForNewCart,
    }),
    [
      addItem,
      bumpQuantity,
      clear,
      clearDineInLock,
      close,
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
      resetForNewCart,
      setStep,
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
