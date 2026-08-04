import { describe, expect, it } from "vitest";

import {
  buildPaymentRow,
  payLinkIntent,
  paymentDisplayStatus,
  resolvePaidAt,
  shouldOfferPayLink,
  type PaymentAttemptRow,
  type PaymentIntentRow,
} from "./payments-list";

const intent = (over: Partial<PaymentIntentRow> = {}): PaymentIntentRow => ({
  id: "pi_1",
  status: "requires_payment_method",
  amount_minor: 25000000, // 250,000 UZS — major x 100, UZS included
  currency: "UZS",
  description: "Tuition, August",
  order_id: "ORD-42",
  created_at: "2026-08-04T09:00:00.000Z",
  ...over,
});

describe("payLinkIntent", () => {
  it("is null whenever there is no link, whatever the status", () => {
    expect(payLinkIntent("failed", false)).toBeNull();
    expect(payLinkIntent("awaiting", false)).toBeNull();
  });

  it("never invites action on a settled or canceled payment", () => {
    // These cannot reach here via buildPaymentRow (shouldOfferPayLink gates
    // them), but the function is exported and must not be a footgun on its own.
    expect(payLinkIntent("succeeded", false)).toBeNull();
    expect(payLinkIntent("canceled", false)).toBeNull();
  });

  it("treats processing as send, not retry — the money may still land", () => {
    // "Try again" on a payment that is mid-settlement is how a customer pays
    // twice.
    expect(payLinkIntent("processing", true)).toBe("send");
  });
});

const attempt = (over: Partial<PaymentAttemptRow> = {}): PaymentAttemptRow => ({
  payment_intent_id: "pi_1",
  status: "succeeded",
  provider_id: "uzum",
  updated_at: "2026-08-04T09:05:00.000Z",
  ...over,
});

describe("paymentDisplayStatus", () => {
  it("treats both requires_* states as simply not paid yet", () => {
    // A merchant does not care which half of the handshake is outstanding.
    expect(paymentDisplayStatus("requires_payment_method")).toBe("awaiting");
    expect(paymentDisplayStatus("requires_action")).toBe("awaiting");
  });

  it("keeps processing distinct from both paid and unpaid", () => {
    // The money may still land. "Not paid" would be a lie a merchant acts on;
    // "paid" would be the expensive one.
    expect(paymentDisplayStatus("processing")).toBe("processing");
  });

  it("maps the terminal states straight through", () => {
    expect(paymentDisplayStatus("succeeded")).toBe("succeeded");
    expect(paymentDisplayStatus("failed")).toBe("failed");
    expect(paymentDisplayStatus("canceled")).toBe("canceled");
  });

  it("falls back to awaiting for a status the schema gains later", () => {
    expect(paymentDisplayStatus("some_future_state")).toBe("awaiting");
  });
});

describe("shouldOfferPayLink", () => {
  it("offers a link only while the payment can still be completed", () => {
    expect(shouldOfferPayLink("awaiting")).toBe(true);
    expect(shouldOfferPayLink("failed")).toBe(true);
  });

  it("never offers one for a payment that already succeeded", () => {
    // Re-sending a link for a settled payment is how a customer gets charged
    // twice by a merchant who was only trying to be helpful.
    expect(shouldOfferPayLink("succeeded")).toBe(false);
  });

  it("never offers one for a canceled payment", () => {
    expect(shouldOfferPayLink("canceled")).toBe(false);
    expect(shouldOfferPayLink("processing")).toBe(false);
  });
});

describe("resolvePaidAt", () => {
  it("uses the succeeded attempt's timestamp", () => {
    expect(resolvePaidAt("succeeded", [attempt()])).toBe("2026-08-04T09:05:00.000Z");
  });

  it("ignores failed attempts when picking the moment of payment", () => {
    const rows = [
      attempt({ status: "failed", updated_at: "2026-08-04T09:20:00.000Z" }),
      attempt({ status: "succeeded", updated_at: "2026-08-04T09:05:00.000Z" }),
    ];
    // The later timestamp belongs to a decline, not to the charge.
    expect(resolvePaidAt("succeeded", rows)).toBe("2026-08-04T09:05:00.000Z");
  });

  it("is null for anything not settled", () => {
    expect(resolvePaidAt("awaiting", [attempt()])).toBeNull();
    expect(resolvePaidAt("processing", [attempt()])).toBeNull();
  });
});

describe("buildPaymentRow", () => {
  it("never leaks metadata to the browser", () => {
    // The intent row carries merchant-supplied metadata, and on dashboard
    // payments it also carries the hardcoded demo fiscal cart (SPIC, TIN) from
    // actions.ts. Spreading the row would have shipped both.
    const row = buildPaymentRow({
      intent: { ...intent(), metadata: { TIN: "123456789" } } as PaymentIntentRow,
      attempts: [],
      openPublicToken: "tok_abc",
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(Object.keys(row)).not.toContain("metadata");
    expect(JSON.stringify(row)).not.toContain("123456789");
  });

  it("builds a pay link for an unpaid payment that still has an open session", () => {
    const row = buildPaymentRow({
      intent: intent(),
      attempts: [],
      openPublicToken: "tok_abc",
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(row.payUrl).toBe("https://pay.krafta.org/pay/tok_abc");
    expect(row.status).toBe("awaiting");
  });

  it("withholds the link once the payment succeeded, even if a session is open", () => {
    const row = buildPaymentRow({
      intent: intent({ status: "succeeded" }),
      attempts: [attempt()],
      openPublicToken: "tok_abc",
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(row.payUrl).toBeNull();
    expect(row.paidAt).toBe("2026-08-04T09:05:00.000Z");
    expect(row.providerId).toBe("uzum");
  });

  it("has no link when there is no open session to point at", () => {
    const row = buildPaymentRow({
      intent: intent(),
      attempts: [],
      openPublicToken: null,
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(row.payUrl).toBeNull();
  });

  it("asks the merchant to retry after a decline, and to send when nobody has tried", () => {
    const declined = buildPaymentRow({
      intent: intent({ status: "failed" }),
      attempts: [],
      openPublicToken: "tok_abc",
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(declined.payLinkIntent).toBe("retry");

    const untouched = buildPaymentRow({
      intent: intent({ status: "requires_payment_method" }),
      attempts: [],
      openPublicToken: "tok_abc",
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(untouched.payLinkIntent).toBe("send");
  });

  it("offers no intent when it offers no link", () => {
    // Otherwise the row would prompt "send this to the customer" with nothing
    // to send, or worse, invite a retry on a payment that already settled.
    const settled = buildPaymentRow({
      intent: intent({ status: "succeeded" }),
      attempts: [],
      openPublicToken: "tok_abc",
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(settled.payUrl).toBeNull();
    expect(settled.payLinkIntent).toBeNull();

    const noSession = buildPaymentRow({
      intent: intent({ status: "failed" }),
      attempts: [],
      openPublicToken: null,
      payBaseUrl: "https://pay.krafta.org",
    });
    expect(noSession.payLinkIntent).toBeNull();
  });

  it("keeps the amount in minor units for the formatter", () => {
    // 250,000 UZS is 25000000 minor. Dividing here as well as in
    // formatMinorAmount would render 2,500.
    const row = buildPaymentRow({
      intent: intent(),
      attempts: [],
      openPublicToken: null,
      payBaseUrl: "",
    });
    expect(row.amountMinor).toBe(25000000);
  });
});
