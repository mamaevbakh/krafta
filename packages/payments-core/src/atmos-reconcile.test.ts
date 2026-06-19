import { describe, it, expect } from "vitest";
import { reconcileAtmosPaymentIntent } from "./atmos-reconcile";
import type { AtmosChargeStatus } from "./providers/atmos";

// Same minimal chainable Supabase fake as subscription.test.ts: reads return
// canned rows per table; writes are recorded so we can assert side effects.
function fakeSupabase(rows: Record<string, unknown>, mutations: string[]) {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
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

const fixedStatus =
  (status: AtmosChargeStatus) =>
  async () =>
    status;

describe("reconcileAtmosPaymentIntent", () => {
  it("finalizes a one-off intent (no invoice) when Atmos reports succeeded", async () => {
    // Mirrors the stranded dev example: a one-off intent stuck 'processing' whose
    // Atmos attempt already carries provider_payment_id (254179). pay/get says
    // succeeded -> finalize must flip intent + checkout, with no invoice/subscription writes.
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi1", status: "processing", metadata: {} },
        checkout_sessions: { public_token: "tok1" },
        payment_attempts: {
          id: "att1",
          org_provider_account_id: "opa1",
          provider_payment_id: "254179",
          raw_init_response: { attemptKind: "atmos_inline_charge" },
          status: "succeeded",
        },
        // no invoices row -> one-off
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi1", {
      fetchAtmosStatus: fixedStatus("succeeded"),
    });

    expect(result.outcome).toBe("succeeded");
    expect(result.transactionId).toBe("254179");
    expect(result.publicToken).toBe("tok1");
    expect(mutations).toContain("update:payment_intents"); // -> succeeded
    expect(mutations).toContain("update:checkout_sessions"); // -> completed
    expect(mutations).not.toContain("update:invoices");
    expect(mutations).not.toContain("update:subscriptions");
    expect(mutations).not.toContain("insert:subscription_events");
  });

  it("settles a subscription intent (invoice + subscription) when Atmos reports succeeded", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: {
          id: "pi2",
          status: "processing",
          metadata: { invoice_id: "inv2", subscription_id: "sub2" },
        },
        checkout_sessions: { public_token: "tok2" },
        payment_attempts: {
          id: "att2",
          org_provider_account_id: "opa2",
          provider_payment_id: "999",
          raw_init_response: {},
          status: "succeeded",
        },
        invoices: {
          id: "inv2",
          subscription_id: "sub2",
          billing_period_start: null,
          billing_period_end: null,
          attempt_count: 0,
          metadata: {},
        },
        subscriptions: { id: "sub2", customer_id: "cust2", org_id: "org2", default_payment_method_id: null },
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi2", {
      fetchAtmosStatus: fixedStatus("succeeded"),
    });

    expect(result.outcome).toBe("succeeded");
    expect(mutations).toContain("update:payment_intents");
    expect(mutations).toContain("update:invoices");
    expect(mutations).toContain("update:subscriptions");
    expect(mutations).toContain("insert:subscription_events");
  });

  it("falls back to providerRefs.transactionId when provider_payment_id is null", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi3", status: "processing", metadata: {} },
        checkout_sessions: { public_token: "tok3" },
        payment_attempts: {
          id: "att3",
          org_provider_account_id: "opa3",
          provider_payment_id: null,
          raw_init_response: { providerRefs: { transactionId: "778899" } },
          status: "processing",
        },
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi3", {
      fetchAtmosStatus: fixedStatus("succeeded"),
    });

    expect(result.transactionId).toBe("778899");
    expect(result.outcome).toBe("succeeded");
  });

  it("marks a one-off intent failed (intent + checkout) when Atmos reports failed", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi4", status: "processing", metadata: {} },
        checkout_sessions: { public_token: "tok4" },
        payment_attempts: {
          id: "att4",
          org_provider_account_id: "opa4",
          provider_payment_id: "100",
          raw_init_response: {},
          status: "processing",
        },
        // no invoices row -> standalone failure path
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi4", {
      fetchAtmosStatus: fixedStatus("failed"),
    });

    expect(result.outcome).toBe("failed");
    expect(mutations).toContain("update:payment_intents"); // -> failed
    expect(mutations).toContain("update:checkout_sessions"); // -> failed
    expect(mutations).toContain("update:payment_attempts"); // attempt -> failed
  });

  it("never auto-fails when no transaction id is resolvable (manual review)", async () => {
    const mutations: string[] = [];
    let fetched = false;
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi5", status: "processing", metadata: {} },
        checkout_sessions: { public_token: "tok5" },
        payment_attempts: {
          id: "att5",
          org_provider_account_id: "opa5",
          provider_payment_id: null,
          raw_init_response: { attemptKind: "atmos_bind_init" },
          status: "requires_action",
        },
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi5", {
      fetchAtmosStatus: async () => {
        fetched = true;
        return "succeeded";
      },
    });

    expect(result.outcome).toBe("skipped_no_transaction_id");
    expect(fetched).toBe(false); // never even calls Atmos
    expect(mutations).not.toContain("update:payment_intents");
  });

  it("skips a non-Atmos processing intent (no atmos attempt)", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi6", status: "processing", metadata: {} },
        checkout_sessions: { public_token: "tok6" },
        // no payment_attempts row -> not an atmos intent
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi6", {
      fetchAtmosStatus: fixedStatus("succeeded"),
    });

    expect(result.outcome).toBe("skipped_no_attempt");
    expect(mutations).toEqual([]);
  });

  it("is a no-op when the intent has already left 'processing'", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi7", status: "succeeded", metadata: {} },
        checkout_sessions: { public_token: "tok7" },
      },
      mutations,
    );

    const result = await reconcileAtmosPaymentIntent(supa, "pi7", {
      fetchAtmosStatus: fixedStatus("succeeded"),
    });

    expect(result.outcome).toBe("skipped_not_processing");
    expect(mutations).toEqual([]);
  });
});
