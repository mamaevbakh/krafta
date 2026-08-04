import { describe, expect, it } from "vitest";
import { forwardQuery } from "./forward-query";

describe("forwardQuery", () => {
  it("carries a server action's error back to the org-scoped page", () => {
    // The exact shape `createSubscriptionCheckoutAction` redirects with when
    // the plan is missing. Losing this is what makes a failed submit look like
    // no submit at all.
    const query = forwardQuery({
      orgId: "c03f8bd1-0000-0000-0000-000000000000",
      subError: "Select a plan",
    });

    expect(new URLSearchParams(query).get("subError")).toBe("Select a plan");
  });

  it("carries the pay link and token back on success", () => {
    const query = forwardQuery({
      orgId: "c03f8bd1-0000-0000-0000-000000000000",
      subPayUrl: "https://pay.krafta.org/pay/tok_abc123",
      subToken: "tok_abc123",
    });
    const parsed = new URLSearchParams(query);

    expect(parsed.get("subPayUrl")).toBe("https://pay.krafta.org/pay/tok_abc123");
    expect(parsed.get("subToken")).toBe("tok_abc123");
  });

  it("never forwards orgId", () => {
    // Org-scoped routes authorize on the slug. Reintroducing ?orgId= downstream
    // would restore the enumeration surface those routes removed.
    const query = forwardQuery({ orgId: "any-org", subError: "boom" });

    expect(new URLSearchParams(query).has("orgId")).toBe(false);
  });

  it("returns an empty string when orgId was the only param", () => {
    // The caller appends `?` only for a non-empty result — a bare `?` on the
    // redirect target would be noise in every bookmark that follows.
    expect(forwardQuery({ orgId: "any-org" })).toBe("");
    expect(forwardQuery({})).toBe("");
  });

  it("preserves values that need re-encoding", () => {
    // Error messages are free text and pay URLs carry their own query string.
    // Round-tripping through URLSearchParams has to survive both.
    const message = "You do not have access to this org & it is not yours";
    const payUrl = "https://pay.krafta.org/pay/tok_x?lang=ru&amount=250000";

    const parsed = new URLSearchParams(
      forwardQuery({ subError: message, subPayUrl: payUrl }),
    );

    expect(parsed.get("subError")).toBe(message);
    expect(parsed.get("subPayUrl")).toBe(payUrl);
  });

  it("keeps every value when a key repeats", () => {
    expect(forwardQuery({ tag: ["a", "b"] })).toBe("tag=a&tag=b");
  });

  it("skips keys Next parsed with no value", () => {
    expect(forwardQuery({ subError: undefined, subToken: "tok_1" })).toBe("subToken=tok_1");
  });
});
