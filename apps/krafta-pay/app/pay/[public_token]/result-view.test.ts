import { describe, expect, it } from "vitest";

import { resolveResultView } from "./result-view";

const view = (over: Partial<Parameters<typeof resolveResultView>[0]> = {}) =>
  resolveResultView({
    mode: "success",
    intentStatus: "succeeded",
    hasReturnTarget: true,
    ...over,
  });

describe("resolveResultView", () => {
  it("shows only the loader once the money has landed and we are leaving", () => {
    // A receipt the customer cannot finish reading before being redirected is
    // worse than no receipt.
    expect(view()).toBe("loader_only");
  });

  it("keeps the full receipt when there is nowhere to send them", () => {
    // No merchant page behind this one, so it is the only record the customer
    // will ever see of what they paid for.
    expect(view({ hasReturnTarget: false })).toBe("full");
  });

  it("keeps the full page while the payment is still being confirmed", () => {
    // "We're checking with the provider" has to stay readable — this is the
    // window where the customer most wants to know what is happening.
    for (const intentStatus of ["processing", "requires_action", "requires_payment_method"]) {
      expect(view({ intentStatus })).toBe("full");
    }
  });

  it("keeps the full page on a decline, which is the one they must read", () => {
    // The failure copy carries the reason and the retry. Hiding it behind a
    // spinner would strand them.
    for (const intentStatus of ["failed", "canceled", "cancelled"]) {
      expect(view({ intentStatus })).toBe("full");
    }
  });

  it("treats a missing or unknown status as not-yet-paid", () => {
    expect(view({ intentStatus: null })).toBe("full");
    expect(view({ intentStatus: undefined })).toBe("full");
    expect(view({ intentStatus: "" })).toBe("full");
    expect(view({ intentStatus: "something_new" })).toBe("full");
  });

  it("reads the status case-insensitively", () => {
    expect(view({ intentStatus: "SUCCEEDED" })).toBe("loader_only");
  });

  it("applies on the failure route too, when that route reports a success", () => {
    // mode is where the provider sent them, not what happened. A customer who
    // lands on /failure but whose payment did settle is still on their way out.
    expect(view({ mode: "failure" })).toBe("loader_only");
  });
});
