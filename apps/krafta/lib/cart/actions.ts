"use server";

import { revalidatePath } from "next/cache";

import { ensureCartIdentity, type CartIdentity } from "./identity";
import { withIdempotency } from "./idempotency";
import {
  addLineItem as addLineItemImpl,
  clearCart as clearCartImpl,
  getCartSummary as getCartSummaryImpl,
  getOrCreateDraftOrder as getOrCreateDraftOrderImpl,
  removeLineItem as removeLineItemImpl,
  updateLineItemQuantity as updateLineItemQuantityImpl,
  type CartSummary,
} from "./orders";
import type { ModifierSelection } from "./modifier-signature";
import {
  placeOrder as placeOrderImpl,
  type PlaceOrderInput,
  type PlaceOrderResult,
} from "./checkout";

// Cart mutations DELIBERATELY skip revalidatePath of the catalog path:
//
//   1. The cart isn't rendered server-side in the catalog page tree —
//      it's a client component (CartProvider) that fetches its own
//      state via getCartSummaryAction. Invalidating the catalog cache
//      does nothing useful for the cart.
//   2. The storefront page uses "use cache" (see lib/catalogs/data.ts).
//      revalidatePath there triggers Next 16's automatic post-
//      server-action router refresh, which re-fetches the cached
//      catalog payload (~1-2 s), re-mounts the cart-provider, fires
//      its hydration effect a second time (the spurious
//      getCartSummary calls you'd see in the dev logs), and races
//      with the action's own return value — wiping the optimistic
//      placeholder the user just added.
//   3. The catalog data (items, prices, modifiers) doesn't change from
//      a cart add/update/remove. Only the cart's own state does, and
//      we already return the fresh cart summary from these actions for
//      the client to reconcile against.
//
// placeOrderAction is the only cart action that DOES revalidate, and
// only because the order transitions draft → open (which surfaces on
// the merchant orders dashboard if they're looking) and clears the
// customer's cart at the same moment — by then the optimistic /
// stepper UI is gone, so the re-render is harmless.

export async function ensureCartIdentityAction(
  orgId: string,
): Promise<CartIdentity> {
  return ensureCartIdentity(orgId);
}

// All cart mutation actions accept an optional `identity` hint. When the
// client has already bootstrapped identity (via ensureCartIdentityAction on
// CartProvider mount, cached for the session), it threads the hint into every
// mutation — the server skips the ~200ms `auth.getUser()` + customers SELECT
// round-trip. RLS still scopes every read/write to `auth.uid()`, so a forged
// hint can't widen privilege. Likewise `orderId` lets getCartSummaryImpl skip
// the orders lookup on the post-mutation reconcile.
//
// Performance impact (KRA cart latency cut, 2026-05): with both hints, an
// `addLineItemAction` round-trip is one ensureCartIdentity, one parallel
// reads block (draft+item+variation+IMLs), one candidate query, one
// upsert — down from ~10 sequential queries to ~4. Combined with the
// embedded select in getCartSummary, the action drops from ~2.7s to <1s
// on dev (and proportionally faster on prod).

export async function getCartSummaryAction(input: {
  orgId: string;
  venueId: string;
  identity?: CartIdentity;
  orderId?: string;
}): Promise<CartSummary> {
  return getCartSummaryImpl(input);
}

export async function addLineItemAction(input: {
  orgId: string;
  venueId: string;
  itemId: string;
  variationId?: string;
  quantity?: number;
  modifiers?: ModifierSelection[];
  /** Kept on the input for backward compat with the cart-provider call
   *  sites; intentionally unused now (see file-level comment above). */
  catalogPath: string;
  identity?: CartIdentity;
  /** KRA-108: client-generated UUID per logical user action. Same key
   *  twice → server returns cached result, never re-executes. Closes
   *  the multi-tab / refresh-mid-flight / strict-mode-double-invoke
   *  duplicate-write classes structurally. Optional for backward
   *  compatibility while the v2 client rolls out; legacy callers
   *  bypass dedup. */
  idempotencyKey?: string;
}): Promise<CartSummary> {
  const identity = input.identity ?? (await ensureCartIdentity(input.orgId));
  return withIdempotency(input.idempotencyKey, identity.customerId, async () => {
    const { orderId } = await addLineItemImpl({ ...input, identity });
    return getCartSummaryImpl({
      orgId: input.orgId,
      venueId: input.venueId,
      identity,
      orderId,
    });
  });
}

export async function updateLineItemQuantityAction(input: {
  orgId: string;
  venueId: string;
  lineItemId: string;
  quantity: number;
  catalogPath: string;
  identity?: CartIdentity;
  /** Optional draft orderId hint — when provided we skip the orders lookup in
   *  the post-mutation getCartSummary. Cart-provider passes `summary.orderId`
   *  on every update once it knows it. */
  orderId?: string;
  /** KRA-108 idempotency key — see addLineItemAction. */
  idempotencyKey?: string;
}): Promise<CartSummary> {
  const identity = input.identity ?? (await ensureCartIdentity(input.orgId));
  return withIdempotency(input.idempotencyKey, identity.customerId, async () => {
    await updateLineItemQuantityImpl(input.lineItemId, input.quantity);
    return getCartSummaryImpl({
      orgId: input.orgId,
      venueId: input.venueId,
      identity,
      orderId: input.orderId,
    });
  });
}

export async function removeLineItemAction(input: {
  orgId: string;
  venueId: string;
  lineItemId: string;
  catalogPath: string;
  identity?: CartIdentity;
  orderId?: string;
  /** KRA-108 idempotency key — see addLineItemAction. */
  idempotencyKey?: string;
}): Promise<CartSummary> {
  const identity = input.identity ?? (await ensureCartIdentity(input.orgId));
  return withIdempotency(input.idempotencyKey, identity.customerId, async () => {
    await removeLineItemImpl(input.lineItemId);
    return getCartSummaryImpl({
      orgId: input.orgId,
      venueId: input.venueId,
      identity,
      orderId: input.orderId,
    });
  });
}

export async function clearCartAction(input: {
  orgId: string;
  venueId: string;
  catalogPath: string;
  identity?: CartIdentity;
  orderId?: string;
  /** KRA-108 idempotency key — see addLineItemAction. */
  idempotencyKey?: string;
}): Promise<CartSummary> {
  const identity = input.identity ?? (await ensureCartIdentity(input.orgId));
  return withIdempotency(input.idempotencyKey, identity.customerId, async () => {
    // If the client knows orderId (the common case after the cart has any
    // line), skip the getOrCreateDraftOrder lookup entirely and clear
    // directly.
    const orderId =
      input.orderId ??
      (await getOrCreateDraftOrderImpl({
        orgId: input.orgId,
        venueId: input.venueId,
        identity,
      })).orderId;
    await clearCartImpl(orderId);
    return getCartSummaryImpl({
      orgId: input.orgId,
      venueId: input.venueId,
      identity,
      orderId,
    });
  });
}

export async function placeOrderAction(
  input: PlaceOrderInput & { catalogPath: string },
): Promise<PlaceOrderResult> {
  const result = await placeOrderImpl(input);
  revalidatePath(input.catalogPath);
  return result;
}
