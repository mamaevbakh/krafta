import { describe, expect, it } from "vitest";

import {
  serializePayment,
  subscriptionIntentIds,
  type PaymentAttemptRecord,
  type PaymentIntentRecord,
} from "./v1-payments";

const intent = (over: Partial<PaymentIntentRecord> = {}): PaymentIntentRecord => ({
  id: "pi_1",
  status: "succeeded",
  amount_minor: 25000000, // 250,000 UZS — major x 100, UZS included
  currency: "UZS",
  description: "Tuition, August",
  order_id: "ORD-42",
  metadata: { cartId: "c-9" },
  created_at: "2026-08-04T09:00:00.000Z",
  ...over,
});

const attempt = (over: Partial<PaymentAttemptRecord> = {}): PaymentAttemptRecord => ({
  payment_intent_id: "pi_1",
  status: "succeeded",
  provider_id: "uzum",
  provider_payment_id: "254179",
  updated_at: "2026-08-04T09:05:00.000Z",
  ...over,
});

describe("serializePayment", () => {
  it("returns the merchant's own orderId and metadata", () => {
    // These are the caller's only correlation handles. Everything else in the
    // shape is ours and can change.
    const out = serializePayment(intent(), [attempt()], true);
    expect(out.orderId).toBe("ORD-42");
    expect(out.metadata).toEqual({ cartId: "c-9" });
  });

  it("withholds Krafta Pay's own metadata keys", () => {
    // Merchant metadata and our bookkeeping share one jsonb column. The
    // dashboard create path also writes placeholder fiscal identifiers there.
    const out = serializePayment(
      intent({
        metadata: {
          cartId: "c-9",
          subscription_id: "sub_x",
          invoice_id: "inv_x",
          uzumCart: { TIN: "123456789" },
        },
      }),
      [],
      true,
    );
    expect(out.metadata).toEqual({ cartId: "c-9" });
    expect(JSON.stringify(out)).not.toContain("123456789");
  });

  it("never spreads the raw row", () => {
    const out = serializePayment(intent(), [], true) as Record<string, unknown>;
    expect(out.amount_minor).toBeUndefined();
    expect(out.order_id).toBeUndefined();
    expect(out.created_at).toBeUndefined();
  });

  it("takes settledAt from the succeeded attempt, not the newest one", () => {
    // A later decline must not become the moment of payment. There is no
    // paid_at column and no updated_at trigger, so the attempt is the source.
    const out = serializePayment(
      intent(),
      [
        attempt({ status: "failed", updated_at: "2026-08-04T09:20:00.000Z" }),
        attempt({ status: "succeeded", updated_at: "2026-08-04T09:05:00.000Z" }),
      ],
      true,
    );
    expect(out.settledAt).toBe("2026-08-04T09:05:00.000Z");
    expect(out.providerPaymentId).toBe("254179");
  });

  it("has no settledAt while nothing has settled", () => {
    const out = serializePayment(
      intent({ status: "requires_payment_method" }),
      [attempt({ status: "failed" })],
      false,
    );
    expect(out.settledAt).toBeNull();
    expect(out.livemode).toBe(false);
  });

  it("keeps the amount in minor units", () => {
    // 250,000 UZS is 25000000 minor. Dividing here would understate every
    // amount by 100 for a currency people assume has no minor unit.
    expect(serializePayment(intent(), [], true).amountMinor).toBe(25000000);
  });
});

describe("subscriptionIntentIds", () => {
  it("collects the intents that belong to a subscription", () => {
    // invoices.subscription_id is NOT NULL, so "has an invoice" IS "is a
    // subscription charge" — which is why the list does not key on
    // metadata.subscription_id, a field the merchant controls.
    expect(
      subscriptionIntentIds([{ payment_intent_id: "pi_a" }, { payment_intent_id: "pi_b" }]),
    ).toEqual(new Set(["pi_a", "pi_b"]));
  });

  it("survives a null intent id and an empty result", () => {
    expect(subscriptionIntentIds([{ payment_intent_id: null }])).toEqual(new Set());
    expect(subscriptionIntentIds(null)).toEqual(new Set());
  });
});
