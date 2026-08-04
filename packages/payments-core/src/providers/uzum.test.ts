import { describe, expect, it } from "vitest";

import { uzumOrderNumber } from "./uzum";

// Uzum's Checkout spec constrains `orderNumber` to maxLength 36 / minLength 1,
// and answers a repeat with errorCode 3027 ("Payment with this order number
// already exists"). Both failures are silent from our side — an over-long value
// comes back as a generic 2000 ValidationError and a duplicate as 3027, and in
// both cases the customer just sees a broken or expired Uzum page. That is what
// makes this worth a test: the cost of getting it wrong is an uncollectable
// subscription, not a stack trace.
const UZUM_ORDER_NUMBER_MAX = 36;

// A real attempt id: uuid v4, 36 characters — exactly the limit, which is why
// prefixed forms have to strip the dashes rather than just concatenate.
const ATTEMPT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("uzumOrderNumber", () => {
  it("fits inside Uzum's 36-character orderNumber limit", () => {
    // `charge-${uuid}` (43) and `renewal-${uuid}` (44) both used to blow this.
    for (const prefix of ["c", "r", "m"]) {
      expect(uzumOrderNumber(prefix, ATTEMPT_ID).length).toBeLessThanOrEqual(
        UZUM_ORDER_NUMBER_MAX,
      );
    }
  });

  it("stays clear of the bare uuid the binding leg registers under", () => {
    // The same attempt registers two Uzum orders: one to bind the card
    // (orderNumber = the raw attempt id) and one to charge it. If these ever
    // collided, the charge would be rejected as a duplicate and the
    // subscription would bind but never take money.
    expect(uzumOrderNumber("c", ATTEMPT_ID)).not.toBe(ATTEMPT_ID);
  });

  it("keeps distinct attempts distinct", () => {
    const other = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(uzumOrderNumber("c", ATTEMPT_ID)).not.toBe(uzumOrderNumber("c", other));
  });

  it("keeps the binding and charge legs of one attempt distinct", () => {
    expect(uzumOrderNumber("c", ATTEMPT_ID)).not.toBe(uzumOrderNumber("r", ATTEMPT_ID));
  });

  it("is deterministic, so a retried webhook re-registers nothing new", () => {
    expect(uzumOrderNumber("c", ATTEMPT_ID)).toBe(uzumOrderNumber("c", ATTEMPT_ID));
  });
});
