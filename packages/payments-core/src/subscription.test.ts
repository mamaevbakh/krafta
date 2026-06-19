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

  it("finalizes a one-off charge (no subscription/invoice) instead of throwing", async () => {
    // A bare payment-link / hosted-checkout intent has no invoice or subscription.
    // A successful charge must still mark the intent succeeded + checkout complete
    // — and must NOT throw (which previously left the intent 'processing' and showed
    // an error to a customer who had already been charged).
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi3", status: "processing", metadata: {} },
        // no invoices row, no subscriptions row
        payment_attempts: { id: "att3", org_provider_account_id: "opa3" },
      },
      mutations,
    );

    const result = await finalizeInitialPayment(supa, {
      paymentIntentId: "pi3",
      providerId: "atmos",
      providerPaymentId: "254179",
      attemptId: "att3",
    });

    expect(result).toEqual({ subscriptionId: null, invoiceId: null, paymentIntentId: "pi3" });
    expect(mutations).toContain("update:payment_intents"); // intent → succeeded
    expect(mutations).toContain("update:checkout_sessions"); // checkout → completed
    expect(mutations).not.toContain("update:invoices");
    expect(mutations).not.toContain("update:subscriptions");
    expect(mutations).not.toContain("insert:subscription_events");
  });
});
