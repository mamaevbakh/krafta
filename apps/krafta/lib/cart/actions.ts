"use server";

import { revalidatePath } from "next/cache";

import { ensureCartIdentity, type CartIdentity } from "./identity";
import { withIdempotency } from "./idempotency";
import {
  getCartSummary as getCartSummaryImpl,
  type CartSummary,
} from "./orders";
import {
  placeOrder as placeOrderImpl,
  type PlaceOrderInput,
  type PlaceOrderResult,
} from "./checkout";
import {
  upsertCartLines as upsertCartLinesImpl,
  type UpsertCartLinesInput,
} from "./upsert-cart-lines";

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

export async function getCartSummaryAction(input: {
  orgId: string;
  venueId: string;
  identity?: CartIdentity;
  orderId?: string;
}): Promise<CartSummary> {
  return getCartSummaryImpl(input);
}

export async function placeOrderAction(
  input: PlaceOrderInput & { catalogPath: string },
): Promise<PlaceOrderResult> {
  const result = await placeOrderImpl(input);
  revalidatePath(input.catalogPath);
  return result;
}

/**
 * cart-v3 batch upsert action. The provider's debounced scheduler
 * fires this once per batch window with the absolute target qty for
 * every line the customer touched during the window. See
 * `lib/cart/upsert-cart-lines.ts` for the atomic-write semantics
 * and the JS-side validation contract.
 *
 * The `idempotencyKey` is regenerated per flush attempt by the client
 * — if the batch payload grows between attempts (because more taps
 * arrived during the network blip), the new attempt gets a new key
 * and runs fresh. Same-payload retries (callWithRetry) replay with
 * the same key and hit the server cache.
 *
 * This is the only cart-line mutation action. `clear()` on the
 * client side schedules N qty=0 entries through the same batch path;
 * `addItem` / `updateQuantity` / `removeItem` route through the
 * scheduler too. The cart-v2 setLineQuantityAction / clearCartAction
 * primitives have been removed (P5).
 */
export async function upsertCartLinesAction(
  input: UpsertCartLinesInput & {
    catalogPath: string;
    idempotencyKey?: string;
  },
): Promise<CartSummary> {
  const identity = input.identity ?? (await ensureCartIdentity(input.orgId));
  return withIdempotency(input.idempotencyKey, identity.userId, async () => {
    return upsertCartLinesImpl({ ...input, identity });
  });
}
