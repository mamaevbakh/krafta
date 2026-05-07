"use server";

import { revalidatePath } from "next/cache";

import { ensureCartIdentity, type CartIdentity } from "./identity";
import {
  addLineItem as addLineItemImpl,
  clearCart as clearCartImpl,
  getCartSummary as getCartSummaryImpl,
  getOrCreateDraftOrder as getOrCreateDraftOrderImpl,
  removeLineItem as removeLineItemImpl,
  updateLineItemQuantity as updateLineItemQuantityImpl,
  type CartSummary,
} from "./orders";

export async function ensureCartIdentityAction(
  orgId: string,
): Promise<CartIdentity> {
  return ensureCartIdentity(orgId);
}

export async function getCartSummaryAction(input: {
  orgId: string;
  venueId: string;
}): Promise<CartSummary> {
  return getCartSummaryImpl(input);
}

export async function addLineItemAction(input: {
  orgId: string;
  venueId: string;
  itemId: string;
  variationId?: string;
  quantity?: number;
  catalogPath: string;
}): Promise<CartSummary> {
  await addLineItemImpl(input);
  revalidatePath(input.catalogPath);
  return getCartSummaryImpl({ orgId: input.orgId, venueId: input.venueId });
}

export async function updateLineItemQuantityAction(input: {
  orgId: string;
  venueId: string;
  lineItemId: string;
  quantity: number;
  catalogPath: string;
}): Promise<CartSummary> {
  await updateLineItemQuantityImpl(input.lineItemId, input.quantity);
  revalidatePath(input.catalogPath);
  return getCartSummaryImpl({ orgId: input.orgId, venueId: input.venueId });
}

export async function removeLineItemAction(input: {
  orgId: string;
  venueId: string;
  lineItemId: string;
  catalogPath: string;
}): Promise<CartSummary> {
  await removeLineItemImpl(input.lineItemId);
  revalidatePath(input.catalogPath);
  return getCartSummaryImpl({ orgId: input.orgId, venueId: input.venueId });
}

export async function clearCartAction(input: {
  orgId: string;
  venueId: string;
  catalogPath: string;
}): Promise<CartSummary> {
  const draft = await getOrCreateDraftOrderImpl({
    orgId: input.orgId,
    venueId: input.venueId,
  });
  await clearCartImpl(draft.orderId);
  revalidatePath(input.catalogPath);
  return getCartSummaryImpl({ orgId: input.orgId, venueId: input.venueId });
}
