import { describe, it, expect } from "vitest";
import { finalizeInitialPayment } from "./subscription";

// Minimal chainable Supabase fake: reads return canned rows per table; writes
// (update/insert) are recorded so a test can assert whether side effects ran.
function fakeSupabase(rows: Record<string, unknown>, mutations: string[]) {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => b,
      update: (_v: unknown) => {
        mutations.push(`update:${table}`);
        return b;
      },
      insert: (_v: unknown) => {
        mutations.push(`insert:${table}`);
        return b;
      },
      maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return b;
  }
  return { schema: () => ({ from: (table: string) => builder(table) }) } as never;
}

describe("finalizeInitialPayment idempotency (double-finalize guard)", () => {
  it("does NO writes when the intent is already succeeded", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: {
          id: "pi1",
          status: "succeeded",
          metadata: { invoice_id: "inv1", subscription_id: "sub1" },
        },
        invoices: { id: "inv1", subscription_id: "sub1", attempt_count: 1, metadata: {} },
      },
      mutations,
    );

    const result = await finalizeInitialPayment(supa, {
      paymentIntentId: "pi1",
      providerId: "uzum",
      providerPaymentId: "ref1",
    });

    expect(result).toEqual({ subscriptionId: "sub1", invoiceId: "inv1", paymentIntentId: "pi1" });
    expect(mutations).toEqual([]);
  });

  it("DOES write when the intent is not yet succeeded (guard does not over-trigger)", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: {
          id: "pi2",
          status: "processing",
          metadata: { invoice_id: "inv2", subscription_id: "sub2" },
        },
        invoices: {
          id: "inv2",
          subscription_id: "sub2",
          billing_period_start: null,
          billing_period_end: null,
          attempt_count: 0,
          metadata: {},
        },
        payment_attempts: { id: "att2", org_provider_account_id: "opa2" },
        subscriptions: { id: "sub2", customer_id: "cust2", org_id: "org2", default_payment_method_id: null },
      },
      mutations,
    );

    await finalizeInitialPayment(supa, {
      paymentIntentId: "pi2",
      providerId: "uzum",
      providerPaymentId: "ref2",
    });

    expect(mutations).toContain("update:payment_intents");
    expect(mutations).toContain("update:invoices");
    expect(mutations).toContain("update:subscriptions");
    expect(mutations).toContain("insert:subscription_events");
  });
});
