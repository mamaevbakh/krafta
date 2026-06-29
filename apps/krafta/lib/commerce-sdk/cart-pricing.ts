import "server-only";

import { getCartSummary } from "@/lib/cart/orders";
import { computePricing } from "@/lib/cart/pricing";
import { getCatalogTaxes } from "@/lib/catalogs/data";
import {
  isWithinDeliveryZone,
  normalizeDeliverySettings,
} from "@/lib/catalogs/settings/delivery";

import { getCommerceAdminClient } from "./client";
import { getCatalogCurrency, type ApiCurrency } from "./cart-shapes";
import type { CartSessionContext } from "./cart-sessions";

// Server-authoritative pricing PREVIEW for the public commerce API. Reuses the
// exact same computePricing the storefront + placeOrder use, so the number a
// generated shop shows at checkout matches what the engine charges. Money is
// never sent by the client — only the cart, mode, tip, and (for delivery) coords.

export type ApiFeeLine = {
  name: string;
  kind: "tax" | "service_fee";
  inclusionType: "additive" | "included";
  amountCents: number;
  percentage: number;
};

export type ApiPricingBreakdown = {
  subtotalCents: number;
  feeLines: ApiFeeLine[];
  additiveFeesCents: number;
  includedFeesCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  currency: ApiCurrency;
};

export type ApiPricingInput = {
  mode?: "dine_in" | "pickup" | "delivery";
  tipCents?: number;
  deliveryCoords?: { lat: number; lng: number };
};

// Flat delivery fee for the preview. Mirrors placeOrder: re-read server-side,
// never trust the client. Out-of-zone → 0 here (checkout is where the hard
// out_of_zone rejection happens); other modes → 0.
async function previewDeliveryFee(
  catalogId: string,
  input: ApiPricingInput,
): Promise<number> {
  if (input.mode !== "delivery") return 0;
  const admin = getCommerceAdminClient();
  if (!admin) return 0;

  const { data } = await admin
    .from("catalogs")
    .select("settings_delivery")
    .eq("id", catalogId)
    .maybeSingle();
  const settings = normalizeDeliverySettings(
    (data?.settings_delivery ?? {}) as Record<string, unknown>,
  );
  if (!settings.enabled) return 0;

  const coords = input.deliveryCoords;
  if (
    coords &&
    !isWithinDeliveryZone(settings, coords.lat, coords.lng)
  ) {
    return 0;
  }
  return Math.max(0, Math.round(settings.feeCents));
}

export async function previewCartPricing(
  ctx: CartSessionContext,
  venueId: string,
  input: ApiPricingInput,
): Promise<ApiPricingBreakdown> {
  const summary = await getCartSummary({
    orgId: ctx.orgId,
    venueId,
    identity: ctx.identity,
    supabase: ctx.client,
  });
  const taxes = await getCatalogTaxes(ctx.catalogId);
  const tipCents = Math.max(0, Math.floor(input.tipCents ?? 0));
  const deliveryFeeCents = await previewDeliveryFee(ctx.catalogId, input);

  const pricing = computePricing({
    subtotalCents: summary.subtotalCents,
    taxes,
    tipCents,
    deliveryFeeCents,
  });
  const currency = await getCatalogCurrency(ctx.catalogId);

  return {
    subtotalCents: summary.subtotalCents,
    feeLines: pricing.feeLines.map((fee) => ({
      name: fee.name,
      kind: fee.kind,
      inclusionType: fee.inclusionType,
      amountCents: fee.appliedMoneyCents,
      percentage: fee.percentage,
    })),
    additiveFeesCents: pricing.additiveFeesCents,
    includedFeesCents: pricing.includedFeesCents,
    deliveryFeeCents: pricing.deliveryFeeCents,
    tipCents,
    totalCents: pricing.totalCents,
    currency,
  };
}
