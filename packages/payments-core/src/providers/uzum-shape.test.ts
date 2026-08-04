import { describe, expect, it } from "vitest";

import { decideUzumRegisterShape } from "./uzum";

/**
 * Which Uzum order do we register: a payment, or a card binding?
 *
 * Getting this wrong towards `one_step` on a subscription means the card is
 * never saved and renewals can never charge — and nobody finds out until the
 * first renewal falls due. So every rule here is a positive assertion about a
 * one-off, and anything unrecognised must come out `binding`, which is what
 * shipped before this existed.
 *
 * The tempting rule — "an intent with no invoice is a one-off" — is wrong, and
 * these tests pin why: the portal card update, all three card-setup flows and
 * platform-fee provisioning have no invoice either, and every one of them must
 * bind.
 */
const oneOff = {
  cardBinding: "none",
  amountMinor: 25000000, // 250,000 UZS — major x 100, UZS included
  hasInvoice: false,
};

describe("decideUzumRegisterShape", () => {
  it("registers a plain payment for a genuine one-off", () => {
    // The whole point: the customer is asked to pay, not to add a card.
    expect(decideUzumRegisterShape(oneOff)).toBe("one_step");
  });

  it("binds for a subscription, which is recognised by having an invoice", () => {
    expect(decideUzumRegisterShape({ ...oneOff, hasInvoice: true })).toBe("binding");
  });

  it("binds for every zero-amount card-setup flow", () => {
    // Portal card update, the three card-setup callers, platform-fee
    // provisioning. None of them has an invoice, all of them must keep the
    // card, and all of them are zero-amount — which is what separates them.
    for (const amountMinor of [0, -1]) {
      expect(decideUzumRegisterShape({ ...oneOff, amountMinor })).toBe("binding");
    }
  });

  it("binds when the intent never opted out of keeping the card", () => {
    // Anything that does not explicitly say "none" — including every row that
    // predates the column — keeps today's behaviour.
    expect(decideUzumRegisterShape({ ...oneOff, cardBinding: "required" })).toBe("binding");
    expect(decideUzumRegisterShape({ ...oneOff, cardBinding: undefined })).toBe("binding");
    expect(decideUzumRegisterShape({ ...oneOff, cardBinding: null })).toBe("binding");
  });

  it("binds when the amount is missing or not a number", () => {
    for (const amountMinor of [undefined, null, "25000000", NaN]) {
      expect(decideUzumRegisterShape({ ...oneOff, amountMinor })).toBe("binding");
    }
  });

  it("binds when metadata marks this as a card or portal flow", () => {
    const markers = [
      { purpose: "card_update" },
      { portalFlowType: "payment_method_update" },
      { portalSubscriptionId: "sub_1" },
      { subscription_id: "sub_1" },
      { subscriptionId: "sub_1" },
      { customerPortal: { flowType: "payment_method_update" } },
      { customerPortal: { subscriptionId: "sub_1" } },
    ];
    for (const intentMetadata of markers) {
      expect(decideUzumRegisterShape({ ...oneOff, intentMetadata })).toBe("binding");
    }
    // The marker counts from either side — the session carries it on the
    // portal route, the intent on others.
    expect(
      decideUzumRegisterShape({ ...oneOff, sessionMetadata: { purpose: "card_update" } }),
    ).toBe("binding");
  });

  it("cannot be pushed towards one_step by anything a merchant writes", () => {
    // THE SECURITY ASSERTION. payment_intents.metadata is merchant input,
    // copied verbatim from their create request. A merchant forging these keys
    // may only ever force `binding`, which is harmless. No metadata value on
    // any key may turn a card-binding checkout into a plain payment.
    const hostile = [
      { cardBinding: "none" },
      { card_binding: "none" },
      { purpose: "one_off" },
      { oneStep: true },
      { hasInvoice: false },
      { amountMinor: 999999 },
    ];
    for (const intentMetadata of hostile) {
      expect(
        decideUzumRegisterShape({
          cardBinding: "required",
          amountMinor: 25000000,
          hasInvoice: true,
          intentMetadata,
        }),
      ).toBe("binding");
    }
  });

  it("ignores metadata that is not an object", () => {
    for (const intentMetadata of [null, undefined, "card_update", 42]) {
      expect(decideUzumRegisterShape({ ...oneOff, intentMetadata })).toBe("one_step");
    }
  });

  it("needs every proof at once, not a majority", () => {
    // One failing check is enough to bind. This is what makes a new flow added
    // tomorrow safe by default rather than safe by review.
    expect(decideUzumRegisterShape({ ...oneOff, hasInvoice: true, amountMinor: 0 })).toBe(
      "binding",
    );
    expect(
      decideUzumRegisterShape({ ...oneOff, cardBinding: "required", hasInvoice: false }),
    ).toBe("binding");
  });
});
