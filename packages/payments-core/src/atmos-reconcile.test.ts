import { describe, it, expect } from "vitest";
import {
  reconcileAtmosPaymentIntent,
  reconcileProcessingAtmosIntents,
} from "./atmos-reconcile";
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

  it("fails a one-off intent but leaves the checkout session open when Atmos reports failed", async () => {
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
    expect(mutations).toContain("update:payment_attempts"); // attempt -> failed
    // This assertion used to be the opposite, and it was wrong in a way this
    // fake cannot catch: it does not enforce CHECK constraints, so a write of
    // status "failed" passed here while raising 23514 against a real database —
    // `checkout_sessions_status_check` allows only open/completed/expired/
    // canceled. Leaving the session open is also the correct product behaviour:
    // the pay page reads an open session as "you can try another card".
    expect(mutations).not.toContain("update:checkout_sessions");
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

// The first-charge "throw at pre-apply" case (real dev repro 2026-07-13:
// STPIMS-ERR-043 in createAtmosRecurringCharge's pre-apply step). The apply
// route leaves the intent 'processing' on a thrown charge and relies on this
// reconciler. retry-payment only accepts intents in status 'failed', so the
// merchant's Retry button 409s ("payment_intent_not_retryable, processing")
// until the reconciler terminates the intent. These two tests pin down whether
// it actually does — and what it needs in order to.
describe("reconcileProcessingAtmosIntents — first-charge throw at pre-apply", () => {
  // A pay/create transaction id IS issued at Atmos before pre-apply throws, but
  // createAtmosRecurringCharge holds it in a local and never returns, so the
  // apply route never persists it: activateSubscriptionAfterCharge (which stamps
  // provider_payment_id) never runs, and the attempt still carries only the
  // bind-init response — no providerRefs.transactionId. resolveTransactionId
  // therefore returns null, and the reconciler CANNOT prove what happened at
  // Atmos, so by design it never auto-fails. The intent stays 'processing'
  // forever and Retry keeps 409-ing: no auto-recovery. This is the P0 gap.
  it("strands the intent when the pay/create tx id was never persisted (skips, never touches it)", async () => {
    const mutations: string[] = [];
    let atmosQueried = false;
    const supa = fakeSupabase(
      {
        payment_intents: {
          id: "pi_stuck",
          status: "processing",
          metadata: { invoice_id: "inv_stuck", subscription_id: "sub_stuck" },
        },
        checkout_sessions: { public_token: "tok_stuck", payment_intent_id: "pi_stuck" },
        payment_attempts: {
          id: "att_stuck",
          org_provider_account_id: "opa_stuck",
          provider_payment_id: null, // activateSubscriptionAfterCharge never ran
          // exactly what atmos/pre-apply persisted before the charge threw:
          raw_init_response: {
            attemptKind: "atmos_bind_init",
            bindTransactionId: "bind_777",
            phone: null,
          },
          status: "requires_action",
        },
      },
      mutations,
    );

    const result = await reconcileProcessingAtmosIntents(
      supa,
      { paymentIntentId: "pi_stuck" },
      {
        fetchAtmosStatus: async () => {
          atmosQueried = true;
          return "failed";
        },
      },
    );

    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.items[0].outcome).toBe("skipped_no_transaction_id");
    expect(result.items[0].transactionId).toBeNull();
    // Never even consulted Atmos — there was nothing to look the charge up by.
    expect(atmosQueried).toBe(false);
    // Critically: the intent is NOT moved to 'failed', so retry-payment's
    // `status === "failed"` gate stays shut and Retry keeps returning 409.
    expect(mutations).not.toContain("update:payment_intents");
  });

  // The fix (persist the pay/create tx id onto the attempt the moment Atmos
  // issues it, before pre-apply) makes the SAME stuck intent resolvable. Given
  // that id, the reconciler queries pay/get, sees the charge never settled
  // ('failed'), and terminates the intent to 'failed' — which is exactly what
  // unblocks the merchant's Retry button.
  it("terminates the intent to 'failed' once the pay/create tx id is resolvable (unblocks retry)", async () => {
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: {
          id: "pi_stuck",
          status: "processing",
          metadata: { invoice_id: "inv_stuck", subscription_id: "sub_stuck" },
        },
        checkout_sessions: { public_token: "tok_stuck", payment_intent_id: "pi_stuck" },
        payment_attempts: {
          id: "att_stuck",
          org_provider_account_id: "opa_stuck",
          provider_payment_id: null,
          // what the fix persists before pre-apply: the pay/create tx id.
          raw_init_response: {
            attemptKind: "atmos_bind_init",
            bindTransactionId: "bind_777",
            providerRefs: { transactionId: "create_555" },
          },
          status: "requires_action",
        },
        invoices: {
          id: "inv_stuck",
          subscription_id: "sub_stuck",
          attempt_count: 0,
          metadata: {},
        },
        subscriptions: { id: "sub_stuck", status: "incomplete" },
      },
      mutations,
    );

    const result = await reconcileProcessingAtmosIntents(
      supa,
      { paymentIntentId: "pi_stuck" },
      { fetchAtmosStatus: fixedStatus("failed") },
    );

    expect(result.failed).toBe(1);
    expect(result.items[0].outcome).toBe("failed");
    expect(result.items[0].transactionId).toBe("create_555");
    expect(mutations).toContain("update:payment_intents"); // -> failed (unblocks Retry)
    expect(mutations).toContain("update:payment_attempts"); // attempt -> failed
  });
});
