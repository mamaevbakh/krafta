import "server-only";

import { getCartSummary } from "@/lib/cart/orders";

import {
  getCatalogCurrency,
  mapCartLines,
  type ApiCartLine,
} from "./cart-shapes";
import type { ApiPricingBreakdown } from "./cart-pricing";
import type { CartSessionContext } from "./cart-sessions";

// Reconstructs the PUBLIC Order shape from the persisted order rows, read through
// the cart token's RLS-scoped client (so a shopper only ever sees their own
// order). Pricing is rebuilt from the immutable order_payments + order_taxes
// snapshots — the numbers the engine actually charged, not a recomputation.

type OrderMode = "dine_in" | "pickup" | "delivery";
type OrderState =
  | "open"
  | "reserved"
  | "prepared"
  | "completed"
  | "canceled";

export type ApiOrder = {
  id: string;
  state: OrderState;
  mode: OrderMode;
  lines: ApiCartLine[];
  pricing: ApiPricingBreakdown;
  paymentStatus: "pending" | "completed";
  createdAt: string | null;
};

function toPublicState(state: string): OrderState {
  switch (state) {
    case "reserved":
    case "prepared":
    case "completed":
    case "canceled":
      return state;
    default:
      // draft/open (and anything unexpected) surface as "open" — getOrder is
      // only reachable for a placed order.
      return "open";
  }
}

export async function getPublicOrder(
  ctx: CartSessionContext,
  orderId: string,
): Promise<ApiOrder | null> {
  const db = ctx.client.schema("commerce");

  // RLS scopes this to the cart's anon customer; a foreign orderId returns null.
  const { data: order, error } = await db
    .from("orders")
    .select("id, state, created_at, catalog_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return null;

  const [summary, fulfillment, payment, taxRows, currency] = await Promise.all([
    getCartSummary({
      orgId: ctx.orgId,
      venueId: "",
      orderId,
      supabase: ctx.client,
    }),
    db
      .from("fulfillments")
      .select("type")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("order_payments")
      .select("amount_cents, tip_cents, total_cents, status")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("order_taxes")
      .select("name, kind, inclusion_type, percentage, applied_money_cents")
      .eq("order_id", orderId),
    getCatalogCurrency(order.catalog_id as string),
  ]);

  const mode = ((fulfillment.data?.type as OrderMode) ?? "pickup") as OrderMode;
  const subtotalCents = summary.subtotalCents;

  const feeLines = ((taxRows.data ?? []) as Array<{
    name: string;
    kind: "tax" | "service_fee";
    inclusion_type: "additive" | "included";
    percentage: number | string;
    applied_money_cents: number;
  }>).map((row) => ({
    name: row.name,
    kind: row.kind,
    inclusionType: row.inclusion_type,
    amountCents: row.applied_money_cents,
    percentage:
      typeof row.percentage === "string"
        ? Number(row.percentage)
        : row.percentage,
  }));
  const additiveFeesCents = feeLines
    .filter((f) => f.inclusionType === "additive")
    .reduce((sum, f) => sum + f.amountCents, 0);
  const includedFeesCents = feeLines
    .filter((f) => f.inclusionType === "included")
    .reduce((sum, f) => sum + f.amountCents, 0);

  const pay = payment.data as {
    amount_cents?: number;
    tip_cents?: number;
    total_cents?: number;
    status?: string;
  } | null;
  const amountCents = pay?.amount_cents ?? subtotalCents;
  const tipCents = pay?.tip_cents ?? 0;
  // amount = subtotal + additive fees + delivery fee → back out the delivery fee.
  const deliveryFeeCents = Math.max(
    0,
    amountCents - subtotalCents - additiveFeesCents,
  );
  const totalCents = pay?.total_cents ?? amountCents + tipCents;

  return {
    id: order.id as string,
    state: toPublicState(order.state as string),
    mode,
    lines: mapCartLines(summary),
    pricing: {
      subtotalCents,
      feeLines,
      additiveFeesCents,
      includedFeesCents,
      deliveryFeeCents,
      tipCents,
      totalCents,
      currency,
    },
    paymentStatus: pay?.status === "completed" ? "completed" : "pending",
    createdAt: (order.created_at as string | null) ?? null,
  };
}
