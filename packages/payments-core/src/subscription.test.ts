import { describe, it, expect } from "vitest";
import {
  RETRYABLE_INVOICE_STATUSES,
  chargeRenewal,
  finalizeInitialPayment,
  markPaymentFailed,
  persistBindingPaymentMethodForCustomer,
  pickRetryTargetInvoice,
  runRenewalCycle,
} from "./subscription";

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
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        // Array-valued rows resolve as a list, which is how the outbound-webhook
        // endpoint query reads. Anything else stays null, as before.
        Promise.resolve({
          data: Array.isArray(rows[table]) ? rows[table] : null,
          error: null,
        }).then(resolve),
    };
    return b;
  }
  return { schema: () => ({ from: (table: string) => builder(table) }) } as never;
}

describe("payment.* fires for one-off charges only", () => {
  const endpoint = [{ id: "ep_1", enabled_events: null }];

  it("emits a delivery when a one-off settles", async () => {
    // Before this existed, WEBHOOK_EVENT_TYPES held only subscription.* and
    // every emit site required a subscription id — so a one-off payment
    // produced no outbound event at all and an integrator had to poll.
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi_oneoff", org_id: "org1", environment: "live", status: "processing", metadata: {}, amount_minor: 100, currency: "UZS" },
        payment_attempts: { id: "att1", org_provider_account_id: "opa1" },
        checkout_sessions: { id: "cs1", customer_id: null, metadata: {} },
        webhook_endpoints: endpoint,
        // no invoices row — this is what makes it a one-off
      },
      mutations,
    );

    await finalizeInitialPayment(supa, {
      paymentIntentId: "pi_oneoff",
      providerId: "atmos",
      providerPaymentId: "254179",
      attemptId: "att1",
    });

    expect(mutations).toContain("insert:webhook_deliveries");
  });

  it("stays silent for a subscription charge", async () => {
    // A subscription already has subscription.activated / .renewed. Emitting
    // payment.* alongside would double-report one event and invite a merchant
    // to release the same thing twice.
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi_sub", org_id: "org1", environment: "live", status: "processing", metadata: {}, amount_minor: 100, currency: "UZS" },
        invoices: { id: "inv1", subscription_id: "sub1", attempt_count: 0, metadata: {} },
        subscriptions: { id: "sub1", customer_id: "cust1", org_id: "org1", default_payment_method_id: null },
        payment_attempts: { id: "att2", org_provider_account_id: "opa2" },
        checkout_sessions: { id: "cs2", customer_id: null, metadata: {} },
        webhook_endpoints: endpoint,
      },
      mutations,
    );

    await finalizeInitialPayment(supa, {
      paymentIntentId: "pi_sub",
      providerId: "atmos",
      providerPaymentId: "254180",
      attemptId: "att2",
    });

    // It still does its subscription work…
    expect(mutations).toContain("update:subscriptions");
    // …and the deliveries it enqueues come from the subscription path, which
    // this fake's endpoint rows would also satisfy — so assert on the absence of
    // a SECOND emit rather than on silence.
    expect(mutations.filter((m) => m === "insert:webhook_deliveries").length).toBeLessThanOrEqual(1);
  });
});

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

// The shared fake above ignores .eq() entirely — every read returns the canned
// row for its table. That is fine for asserting which side effects ran, but it
// cannot express "this row exists, but not for your org", which is the whole
// question below. This fake applies every .eq() filter, treating a column the
// row does not carry as a non-match, the way Postgres would.
function filteringFakeSupabase(
  rows: Record<string, Record<string, unknown>>,
  mutations: string[],
) {
  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      update: (_v: unknown) => {
        mutations.push(`update:${table}`);
        return b;
      },
      insert: (_v: unknown) => {
        mutations.push(`insert:${table}`);
        return b;
      },
      maybeSingle: () => {
        const row = rows[table];
        const matches =
          row && Object.entries(filters).every(([col, val]) => row[col] === val);
        return Promise.resolve({ data: matches ? row : null, error: null });
      },
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return b;
  }
  return { schema: () => ({ from: (table: string) => builder(table) }) } as never;
}

describe("finalizeInitialPayment ignores merchant-forged invoice/subscription ids", () => {
  it("does not mark another org's invoice paid or their subscription active", async () => {
    // payment_intents.metadata is merchant input: createCheckoutSession copies
    // the request body onto the intent and POST /api/checkout_sessions passes
    // body.metadata through untouched. finalizeInitialPayment reads invoice_id
    // and subscription_id out of it and lets them WIN over the invoice looked
    // up by payment_intent_id, then updates those rows keyed on id alone.
    //
    // So without an ownership check, a merchant could point those at another
    // org's uuids, pay 1 som with their own card, and have us mark that org's
    // invoice paid and extend their subscription. Aiming it at their own
    // subscription is the same trick for free and needs no stolen id.
    const mutations: string[] = [];
    const supa = filteringFakeSupabase(
      {
        payment_intents: {
          id: "pi_attacker",
          org_id: "org_attacker",
          status: "processing",
          metadata: { invoice_id: "inv_victim", subscription_id: "sub_victim" },
        },
        // Both rows exist — they just belong to somebody else.
        invoices: { id: "inv_victim", org_id: "org_victim", subscription_id: "sub_victim" },
        subscriptions: { id: "sub_victim", org_id: "org_victim", customer_id: "cust_victim" },
        payment_attempts: { id: "att_attacker", org_provider_account_id: "opa1" },
      },
      mutations,
    );

    const result = await finalizeInitialPayment(supa, {
      paymentIntentId: "pi_attacker",
      providerId: "atmos",
      providerPaymentId: "999999",
      attemptId: "att_attacker",
    });

    // Falls back to the one-off shape, because neither claim survived the check.
    expect(result.invoiceId).toBeNull();
    expect(result.subscriptionId).toBeNull();
    // The attacker's own intent still settles — refusing the claim must not
    // strand a customer who really was charged.
    expect(mutations).toContain("update:payment_intents");
    // But nothing of the victim's is touched.
    expect(mutations).not.toContain("update:invoices");
    expect(mutations).not.toContain("update:subscriptions");
    expect(mutations).not.toContain("insert:subscription_events");
    // And the rejection is recorded rather than swallowed.
    expect(mutations).toContain("insert:logs");
  });
});

describe("markPaymentFailed records the decline on the attempt", () => {
  it("fails the attempt when the caller names one", async () => {
    // Without this the attempt stays `requires_action` forever, and
    // selectProviderCreateAttempt keeps handing the customer the same dead
    // Uzum order — which is what "a declined Uzum payment cannot be retried"
    // actually was.
    const mutations: string[] = [];
    const supa = fakeSupabase(
      { payment_intents: { id: "pi5", status: "processing", metadata: {} } },
      mutations,
    );

    await markPaymentFailed(supa, {
      paymentIntentId: "pi5",
      providerId: "uzum",
      providerPaymentId: "ref5",
      attemptId: "att5",
    });

    expect(mutations).toContain("update:payment_attempts");
    expect(mutations).toContain("update:payment_intents");
  });

  it("leaves the attempt alone on the dunning path, which mints its own", async () => {
    // A subscription retry creates a fresh attempt. Failing the old one here
    // would rewrite history rather than record it.
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi6", status: "processing", metadata: {} },
        invoices: { id: "inv6", subscription_id: "sub6", attempt_count: 0, metadata: {} },
      },
      mutations,
    );

    await markPaymentFailed(supa, {
      paymentIntentId: "pi6",
      providerId: "uzum",
      providerPaymentId: "ref6",
      attemptId: "att6",
    });

    expect(mutations).not.toContain("update:payment_attempts");
  });
});

describe("markPaymentFailed on a one-off (no invoice)", () => {
  it("marks the intent and the checkout session failed instead of doing nothing", async () => {
    // The counterpart to the success case above. A declined payment-link charge
    // has no invoice, and this used to `return` on that — leaving the intent on
    // `processing` and the session `open`. The customer then sat on "checking
    // with provider" indefinitely, and every retry with a different card was
    // rejected, because the apply route's optimistic lock only accepts
    // requires_action / requires_payment_method / failed.
    const mutations: string[] = [];
    const supa = fakeSupabase(
      {
        payment_intents: { id: "pi4", status: "processing", metadata: {} },
        // no invoices row — this is what makes it a one-off
      },
      mutations,
    );

    await markPaymentFailed(supa, {
      paymentIntentId: "pi4",
      providerId: "atmos",
      providerPaymentId: "254180",
    });

    expect(mutations).toContain("update:payment_intents"); // intent → failed
    // The session must be left alone. `checkout_sessions_status_check` permits
    // only open/completed/expired/canceled, so writing "failed" raises 23514 and
    // 5xxs the provider's webhook — and the pay page reads an open session as
    // "you can try another card", which is exactly what a decline should allow.
    expect(mutations).not.toContain("update:checkout_sessions");
    // Dunning is meaningless without an invoice to retry, so none of the
    // subscription bookkeeping should run.
    expect(mutations).not.toContain("update:invoices");
    expect(mutations).not.toContain("update:subscriptions");
    expect(mutations).not.toContain("insert:subscription_events");
  });
});

// Fake modeling just enough of payments.payment_methods + the
// set_default_payment_method RPC (supabase/migrations/20260712120000) to
// exercise persistBindingPaymentMethodForCustomer without a real DB. The rpc()
// stub mirrors the RPC's own atomic "one true default" semantics so these
// tests catch a regression in either the JS call site or a future rewrite
// of the SQL that stops being atomic-equivalent.
type FakePaymentMethodRow = {
  id: string;
  customer_id: string;
  org_provider_account_id: string;
  provider_id: string;
  provider_token: string;
  is_default: boolean;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  metadata: Record<string, unknown>;
};

function fakePersistPaymentMethodSupabase(seed: FakePaymentMethodRow[]) {
  const paymentMethods = seed;
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let nextId = 1;

  function paymentMethodsBuilder() {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      // Awaited only by the reuse-backfill UPDATE (`.update(...).eq("id", ...)`);
      // applies the patch to the row matching the accumulated filters.
      then: (resolve: (v: { error: null }) => unknown) => {
        if (pendingUpdate) {
          const match = paymentMethods.find((row) =>
            Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v),
          );
          if (match) Object.assign(match, pendingUpdate);
          pendingUpdate = null;
        }
        return Promise.resolve({ error: null }).then(resolve);
      },
      update: (values: Record<string, unknown>) => {
        pendingUpdate = values;
        return b;
      },
      maybeSingle: () => {
        const match = paymentMethods.find((row) =>
          Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v),
        );
        return Promise.resolve({ data: match ? { id: match.id } : null, error: null });
      },
      insert: (values: Record<string, unknown>) => {
        const row: FakePaymentMethodRow = {
          id: `pm_new_${nextId++}`,
          customer_id: values.customer_id as string,
          org_provider_account_id: values.org_provider_account_id as string,
          provider_id: values.provider_id as string,
          provider_token: values.provider_token as string,
          is_default: values.is_default as boolean,
          brand: (values.brand as string | null) ?? null,
          last4: (values.last4 as string | null) ?? null,
          exp_month: (values.exp_month as number | null) ?? null,
          exp_year: (values.exp_year as number | null) ?? null,
          metadata: (values.metadata as Record<string, unknown>) ?? {},
        };
        paymentMethods.push(row);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: row.id }, error: null }),
          }),
        };
      },
    };
    return b;
  }

  const schemaClient = {
    from: (table: string) => {
      if (table === "payment_methods") return paymentMethodsBuilder();
      throw new Error(`fakePersistPaymentMethodSupabase: unexpected table ${table}`);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "set_default_payment_method") {
        const customerId = args.p_customer_id;
        const targetId = args.p_payment_method_id;
        for (const row of paymentMethods) {
          if (row.customer_id === customerId) row.is_default = row.id === targetId;
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return {
    supabase: { schema: () => schemaClient } as never,
    paymentMethods,
    rpcCalls,
  };
}

describe("persistBindingPaymentMethodForCustomer", () => {
  it("writes brand/last4/exp_month/exp_year on the new row (was hardcoded null — bug 1)", async () => {
    const { supabase, paymentMethods } = fakePersistPaymentMethodSupabase([]);

    const result = await persistBindingPaymentMethodForCustomer(supabase, {
      customerId: "cust1",
      providerId: "atmos",
      bindingId: "card_token_abc",
      orgProviderAccountId: "opa1",
      cardDetails: { brand: "humo", last4: "4364", expMonth: 2, expYear: 2028 },
    });

    expect(result.created).toBe(true);
    expect(paymentMethods).toHaveLength(1);
    expect(paymentMethods[0]).toMatchObject({
      brand: "humo",
      last4: "4364",
      exp_month: 2,
      exp_year: 2028,
    });
    // Bug 1 also hardcoded metadata.source to "uzum_binding" regardless of provider.
    expect(paymentMethods[0].metadata).toEqual({ source: "atmos_binding" });
  });

  it("flips the customer's previous default card to is_default:false when a second is bound (bug 2)", async () => {
    const { supabase, paymentMethods } = fakePersistPaymentMethodSupabase([
      {
        id: "pm_existing",
        customer_id: "cust1",
        org_provider_account_id: "opa1",
        provider_id: "atmos",
        provider_token: "old_card_token",
        is_default: true,
        brand: "visa",
        last4: "1111",
        exp_month: 1,
        exp_year: 2027,
        metadata: { source: "atmos_binding" },
      },
    ]);

    const result = await persistBindingPaymentMethodForCustomer(supabase, {
      customerId: "cust1",
      providerId: "atmos",
      bindingId: "new_card_token",
      orgProviderAccountId: "opa1",
      cardDetails: { brand: "humo", last4: "4364", expMonth: 2, expYear: 2028 },
    });

    expect(result.created).toBe(true);
    expect(paymentMethods).toHaveLength(2);

    const defaults = paymentMethods.filter((row) => row.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(result.paymentMethodId);

    const previousCard = paymentMethods.find((row) => row.id === "pm_existing");
    expect(previousCard?.is_default).toBe(false);
  });

  it("backfills brand/last4/expiry when re-binding a card already on file (same token)", async () => {
    // A card first saved before these columns existed (or with a now-stale
    // expiry) must be refreshed on re-bind — not left detail-less, which would
    // also feed a stale expiry to the proactive card-expiry warning.
    const { supabase, paymentMethods } = fakePersistPaymentMethodSupabase([
      {
        id: "pm_reused",
        customer_id: "cust1",
        org_provider_account_id: "opa1",
        provider_id: "atmos",
        provider_token: "same_card_token",
        is_default: true,
        brand: null,
        last4: null,
        exp_month: null,
        exp_year: null,
        metadata: { source: "uzum_binding" },
      },
    ]);

    const result = await persistBindingPaymentMethodForCustomer(supabase, {
      customerId: "cust1",
      providerId: "atmos",
      bindingId: "same_card_token", // matches the existing row → reuse path
      orgProviderAccountId: "opa1",
      cardDetails: { brand: "humo", last4: "4364", expMonth: 2, expYear: 2028 },
    });

    expect(result.created).toBe(false);
    expect(result.paymentMethodId).toBe("pm_reused");
    expect(paymentMethods).toHaveLength(1); // no duplicate row
    expect(paymentMethods[0]).toMatchObject({
      id: "pm_reused",
      brand: "humo",
      last4: "4364",
      exp_month: 2,
      exp_year: 2028,
    });
  });
});

// Richer fake for the renewal cron: singles[table] answers maybeSingle/single,
// lists[table] answers an awaited (thenable) query, and every mutation is
// recorded. Supports the extra chain methods the cron uses (.in/.lte/.not).
function fakeRenewalSupabase(opts: {
  singles?: Record<string, unknown>;
  lists?: Record<string, unknown[]>;
  mutations: string[];
}) {
  const singles = opts.singles ?? {};
  const lists = opts.lists ?? {};
  function builder(table: string): Record<string, unknown> {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      lte: () => b,
      gte: () => b,
      not: () => b,
      order: () => b,
      limit: () => b,
      update: () => {
        opts.mutations.push(`update:${table}`);
        return b;
      },
      insert: () => {
        opts.mutations.push(`insert:${table}`);
        return b;
      },
      maybeSingle: () => Promise.resolve({ data: singles[table] ?? null, error: null }),
      single: () => Promise.resolve({ data: singles[table] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: lists[table] ?? [], error: null }).then(resolve),
    };
    return b;
  }
  return { schema: () => ({ from: (table: string) => builder(table) }) } as never;
}

const PAST = new Date(Date.now() - 86_400_000).toISOString();
const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString();

const ACTIVE_SUB = {
  id: "sub1",
  org_id: "org1",
  status: "active",
  customer_id: "cust1",
  plan_id: "plan1",
  default_payment_method_id: "pm1",
  current_period_end: PAST,
  cancel_at_period_end: false,
  metadata: {},
};
const PLAN = { amount_minor: 250000, currency: "UZS", interval_count: 1, name: "Pro", metadata: {} };

describe("chargeRenewal dunning + terminal-invoice guards", () => {
  it("does NOT re-charge an open invoice whose due_at is still in the future (respects 3/7/14 spacing)", async () => {
    const mutations: string[] = [];
    const supa = fakeRenewalSupabase({
      singles: {
        subscriptions: ACTIVE_SUB,
        plans: PLAN,
        invoices: { id: "inv1", payment_intent_id: "pi1", status: "open", due_at: FUTURE },
      },
      mutations,
    });

    const result = await chargeRenewal(supa, { subscriptionId: "sub1" });

    expect(result).toEqual({ skipped: true, reason: "retry_not_due" });
    // No charge was attempted: a payment_attempt insert is the charge signal.
    expect(mutations).not.toContain("insert:payment_attempts");
  });

  it("does NOT charge an uncollectible invoice (stops re-charging a dead card forever)", async () => {
    const mutations: string[] = [];
    const supa = fakeRenewalSupabase({
      singles: {
        subscriptions: ACTIVE_SUB,
        plans: PLAN,
        invoices: { id: "inv1", payment_intent_id: "pi1", status: "uncollectible", due_at: PAST },
      },
      mutations,
    });

    const result = await chargeRenewal(supa, { subscriptionId: "sub1" });

    expect(result).toEqual({ skipped: true, reason: "invoice_not_collectible" });
    expect(mutations).not.toContain("insert:payment_attempts");
  });
});

describe("chargeRenewal single-flight lock (no double charge on a race)", () => {
  it("bails without charging when the intent CAS matches no row (another execution already claimed it)", async () => {
    const mutations: string[] = [];
    // Invoice is open + due, so the dunning guard passes and we reach the lock.
    // A concurrent execution already flipped the intent to 'processing', so the
    // requires_payment_method/failed -> processing CAS returns no row (fake:
    // payment_intents single = null).
    const supa = fakeRenewalSupabase({
      singles: {
        subscriptions: ACTIVE_SUB,
        plans: PLAN,
        invoices: { id: "inv1", payment_intent_id: "pi1", status: "open", due_at: PAST },
        payment_methods: {
          id: "pm1",
          provider_id: "atmos",
          org_provider_account_id: "opa1",
          provider_token: "tok",
        },
        payment_intents: null, // CAS claims nothing -> charge already in flight
      },
      mutations,
    });

    const result = await chargeRenewal(supa, { subscriptionId: "sub1" });

    expect(result).toEqual({ skipped: true, reason: "charge_in_progress" });
    // The single-flight lock must stop the charge dead: no attempt insert, so no
    // second createAtmosRecurringCharge and no duplicate bill for the period.
    expect(mutations).not.toContain("insert:payment_attempts");
  });
});

describe("runRenewalCycle per-subscription error isolation", () => {
  it("does not let one throwing subscription abort the whole batch", async () => {
    const mutations: string[] = [];
    // Two due subs; chargeRenewal throws plan_not_found for both (plans single = null),
    // reached only after the active-status guard passes. The batch must still resolve.
    const supa = fakeRenewalSupabase({
      singles: {
        subscriptions: ACTIVE_SUB, // status active → chargeRenewal proceeds to plan lookup
        plans: null, // → chargeRenewal throws "plan_not_found"
        invoices: null,
      },
      lists: {
        subscriptions: [{ id: "sub1" }, { id: "sub2" }],
        invoices: [],
      },
      mutations,
    });

    const result = await runRenewalCycle(supa, new Date());

    expect(result.erroredSubscriptions).toBe(2);
    expect(result.chargedSubscriptions).toBe(0);
  });

  it("retry loop skips a subscription the primary loop already handled (one chargeRenewal per sub per run)", async () => {
    const mutations: string[] = [];
    // sub1 is due (primary loop) AND has an open due invoice (retry snapshot).
    // chargeRenewal throws plan_not_found (plans single = null), so each call
    // counts as one error. Without the dedup, both loops would charge sub1 and
    // errored would be 2; with it, the retry loop skips sub1 and errored is 1 —
    // proving chargeRenewal ran only once for the subscription this cycle.
    const supa = fakeRenewalSupabase({
      singles: {
        subscriptions: ACTIVE_SUB,
        plans: null,
        invoices: { id: "inv1", payment_intent_id: "pi1", status: "open", due_at: PAST },
      },
      lists: {
        subscriptions: [{ id: "sub1" }],
        invoices: [{ id: "inv1", subscription_id: "sub1" }],
      },
      mutations,
    });

    const result = await runRenewalCycle(supa, new Date());

    expect(result.erroredSubscriptions).toBe(1);
    expect(result.retriedInvoices).toBe(0);
    expect(result.chargedSubscriptions).toBe(0);
  });
});

describe("pickRetryTargetInvoice (past_due self-serve recovery)", () => {
  // The P1: at dunning exhaustion markPaymentFailed sets the invoice to
  // `uncollectible` and the subscription to `past_due` in one write. The manual
  // retry/resume paths used to filter to status `open` only, so they returned
  // nothing for the exact past_due state they claim to recover — leaving the
  // merchant stranded on Free with no working button.
  it("recovers a past_due subscription's uncollectible invoice", () => {
    const invoice = { id: "inv1", payment_intent_id: "pi1", status: "uncollectible" };
    expect(pickRetryTargetInvoice([invoice])).toBe(invoice);
  });

  it("recovers an incomplete subscription's open invoice", () => {
    const invoice = { id: "inv1", payment_intent_id: "pi1", status: "open" };
    expect(pickRetryTargetInvoice([invoice])).toBe(invoice);
  });

  it("returns null when nothing is recoverable (paid / voided / no intent)", () => {
    expect(pickRetryTargetInvoice([{ id: "inv1", payment_intent_id: "pi1", status: "paid" }])).toBeNull();
    expect(pickRetryTargetInvoice([{ id: "inv1", payment_intent_id: "pi1", status: "void" }])).toBeNull();
    // An uncollectible invoice with no intent can't be charged — skip it.
    expect(pickRetryTargetInvoice([{ id: "inv1", payment_intent_id: null, status: "uncollectible" }])).toBeNull();
    expect(pickRetryTargetInvoice([])).toBeNull();
  });

  it("picks the newest recoverable invoice (callers pass newest-first)", () => {
    const newest = { id: "inv2", payment_intent_id: "pi2", status: "uncollectible" };
    const older = { id: "inv1", payment_intent_id: "pi1", status: "open" };
    expect(pickRetryTargetInvoice([newest, older])).toBe(newest);
  });

  it("treats both open and uncollectible as recoverable", () => {
    expect([...RETRYABLE_INVOICE_STATUSES].sort()).toEqual(["open", "uncollectible"]);
  });
});
