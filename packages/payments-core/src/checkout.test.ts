import { describe, expect, it } from "vitest";

import { selectProviderCreateAttempt } from "./checkout";

/**
 * One customer must never be able to pay twice for one order.
 *
 * The session being `open` was the only gate here, and it is not enough: a
 * provider's callback can arrive late, so for the seconds between the customer
 * paying and us hearing about it, the intent still reads "not paid" while the
 * session is still open. In that window our own result page offered "back to
 * checkout" and the adapter below would register a second real order.
 *
 * The guard lives above the provider adapters on purpose. These tests pin that
 * it is provider-agnostic — a new acquirer cannot opt out of it or arrive with
 * its own idea of what "already paid" means.
 */
function fakeSupabase(sessionRow: unknown, intentRow: unknown, seen: string[]) {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      update: () => {
        seen.push(`update:${table}`);
        return b;
      },
      insert: () => {
        seen.push(`insert:${table}`);
        return b;
      },
      maybeSingle: () => {
        seen.push(`read:${table}`);
        return Promise.resolve({
          data: table === "checkout_sessions" ? sessionRow : table === "payment_intents" ? intentRow : null,
          error: null,
        });
      },
      single: () =>
        Promise.resolve({
          data: table === "checkout_sessions" ? sessionRow : table === "payment_intents" ? intentRow : null,
          error: null,
        }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return b;
  }
  return { schema: () => ({ from: (table: string) => builder(table) }) } as never;
}

const openSession = {
  id: "cs_1",
  status: "open",
  public_token: "tok_1",
  payment_intent_id: "pi_1",
  org_id: "org_1",
  selected_provider_id: null,
  selected_attempt_id: null,
  metadata: {},
};

const run = (intentStatus: string, seen: string[] = []) =>
  selectProviderCreateAttempt(
    fakeSupabase(openSession, { id: "pi_1", status: intentStatus }, seen),
    { publicToken: "tok_1", providerId: "uzum" },
    "test",
    "https://pay.krafta.org",
  );

describe("selectProviderCreateAttempt refuses to start a second payment", () => {
  it("refuses when the order already succeeded", async () => {
    await expect(run("succeeded")).rejects.toThrow("payment_intent_already_settled");
  });

  it("refuses while the provider's answer is still outstanding", async () => {
    // `processing` means the customer's money may be moving right now.
    // Treating "we have not heard back" as "nothing happened" is exactly how
    // someone gets charged twice.
    await expect(run("processing")).rejects.toThrow("payment_intent_already_settled");
  });

  it("refuses on a canceled order", async () => {
    await expect(run("canceled")).rejects.toThrow("payment_intent_already_settled");
    await expect(run("cancelled")).rejects.toThrow("payment_intent_already_settled");
  });

  it("creates no provider order when it refuses", async () => {
    // The refusal has to happen BEFORE anything is registered with an acquirer.
    // Throwing after the fact would still have taken the customer's money.
    const seen: string[] = [];
    await expect(run("succeeded", seen)).rejects.toThrow();
    expect(seen.filter((s) => s.startsWith("insert:"))).toHaveLength(0);
    expect(seen.filter((s) => s.startsWith("update:"))).toHaveLength(0);
  });

  it("still allows a genuine first payment and a retry after a decline", async () => {
    // The guard must not become "one attempt per order". A customer whose card
    // was declined has to be able to try again, which is the whole point of
    // leaving the session open on a decline.
    for (const status of ["requires_payment_method", "requires_action", "failed"]) {
      await expect(run(status)).rejects.not.toThrow("payment_intent_already_settled");
    }
  });

  it("reads the intent, not just the session", async () => {
    // The session stays `open` through all of this — it is the intent that
    // knows the money landed. A guard that only consulted the session would
    // pass every one of the cases above.
    const seen: string[] = [];
    await expect(run("succeeded", seen)).rejects.toThrow();
    expect(seen).toContain("read:payment_intents");
  });
});
