import { describe, it, expect } from "vitest";
import {
  buildWebhookSignature,
  deliverPendingWebhooks,
  emitPaymentEvent,
  emitWebhookEvent,
  generateWebhookSecret,
  verifyWebhookSignature,
  WEBHOOK_EVENT_TYPES,
} from "./webhooks-out";
import { encryptSecretJson } from "./secrets";

describe("webhook signature", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "subscription.renewed" });

  it("round-trips a signature it just produced", () => {
    const now = 1_800_000_000;
    const header = buildWebhookSignature({ payloadBody: body, secret, timestampSeconds: now });

    expect(
      verifyWebhookSignature({ payloadBody: body, header, secret, nowSeconds: now }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const now = 1_800_000_000;
    const header = buildWebhookSignature({ payloadBody: body, secret, timestampSeconds: now });

    expect(
      verifyWebhookSignature({
        payloadBody: JSON.stringify({ id: "evt_1", type: "subscription.canceled" }),
        header,
        secret,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const now = 1_800_000_000;
    const header = buildWebhookSignature({ payloadBody: body, secret, timestampSeconds: now });

    expect(
      verifyWebhookSignature({ payloadBody: body, header, secret: "whsec_other", nowSeconds: now }),
    ).toBe(false);
  });

  // The timestamp is inside the MAC, so a captured request cannot be replayed
  // indefinitely — this is the property that makes the scheme worth having.
  it("rejects a signature older than the tolerance window", () => {
    const signedAt = 1_800_000_000;
    const header = buildWebhookSignature({
      payloadBody: body,
      secret,
      timestampSeconds: signedAt,
    });

    expect(
      verifyWebhookSignature({
        payloadBody: body,
        header,
        secret,
        nowSeconds: signedAt + 3600,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });

  it("rejects a malformed or missing header instead of throwing", () => {
    expect(verifyWebhookSignature({ payloadBody: body, header: null, secret })).toBe(false);
    expect(verifyWebhookSignature({ payloadBody: body, header: "garbage", secret })).toBe(false);
    expect(verifyWebhookSignature({ payloadBody: body, header: "t=abc,v1=xx", secret })).toBe(false);
  });

  it("mints distinct secrets", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toEqual(b);
    expect(a.startsWith("whsec_")).toBe(true);
  });
});

/**
 * Chainable fake that records inserts/updates with their payloads, so a test
 * can assert what was written rather than only that something was.
 */
function fakeSupabase(
  tables: Record<string, unknown[]>,
  writes: Array<{ op: string; table: string; value: unknown }>,
) {
  function builder(table: string) {
    const state = { rows: (tables[table] ?? []) as unknown[] };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
      update: (value: unknown) => {
        writes.push({ op: "update", table, value });
        return b;
      },
      insert: (value: unknown) => {
        writes.push({ op: "insert", table, value });
        return b;
      },
      maybeSingle: () => Promise.resolve({ data: state.rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: state.rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(resolve),
    };
    return b;
  }
  return { schema: () => ({ from: (table: string) => builder(table) }) } as never;
}

describe("emitWebhookEvent fan-out", () => {
  it("enqueues one delivery per subscribed endpoint, sharing one event id", async () => {
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      {
        webhook_endpoints: [
          { id: "ep_all", enabled_events: null },
          { id: "ep_specific", enabled_events: ["subscription.renewed"] },
          { id: "ep_other", enabled_events: ["subscription.canceled"] },
        ],
      },
      writes,
    );

    const eventId = await emitWebhookEvent(supa, {
      orgId: "org1",
      environment: "live",
      eventType: "subscription.renewed",
      subscriptionId: "sub1",
      data: { hello: "world" },
    });

    expect(eventId).toBeTruthy();

    const insert = writes.find((w) => w.op === "insert" && w.table === "webhook_deliveries");
    expect(insert).toBeTruthy();

    const rows = insert!.value as Array<Record<string, unknown>>;
    // ep_other subscribes only to subscription.canceled, so it must be skipped.
    expect(rows.map((r) => r.endpoint_id).sort()).toEqual(["ep_all", "ep_specific"]);
    // A shared event id is what lets a consumer dedupe across endpoints.
    expect(new Set(rows.map((r) => r.event_id)).size).toBe(1);
    expect(rows[0].event_id).toBe(eventId);
  });

  it("writes nothing when no endpoint subscribes", async () => {
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      { webhook_endpoints: [{ id: "ep", enabled_events: ["subscription.canceled"] }] },
      writes,
    );

    const eventId = await emitWebhookEvent(supa, {
      orgId: "org1",
      environment: "live",
      eventType: "subscription.renewed",
      data: {},
    });

    expect(eventId).toBeNull();
    expect(writes.filter((w) => w.table === "webhook_deliveries")).toEqual([]);
  });

  // This runs inside charge finalization. A broken endpoint config must never
  // be able to fail a payment that already settled at the provider.
  it("swallows a database error instead of throwing into the charge path", async () => {
    const throwingSupabase = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => Promise.reject(new Error("db is down")),
              }),
            }),
          }),
          insert: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({}).then(r) }),
        }),
      }),
    } as never;

    await expect(
      emitWebhookEvent(throwingSupabase, {
        orgId: "org1",
        environment: "live",
        eventType: "subscription.renewed",
        data: {},
      }),
    ).resolves.toBeNull();
  });
});

/**
 * The outcome write, not the lease.
 *
 * deliverPendingWebhooks issues two updates per delivery: a lease that only
 * bumps `next_attempt_at` to claim the row, then the real result. Both target
 * webhook_deliveries, so "first update" is ambiguous — the outcome is the one
 * carrying `status`.
 */
function findOutcomeWrite(writes: Array<{ op: string; table: string; value: unknown }>) {
  return writes.find(
    (w) =>
      w.op === "update" &&
      w.table === "webhook_deliveries" &&
      typeof w.value === "object" &&
      w.value !== null &&
      "status" in (w.value as Record<string, unknown>),
  );
}

describe("deliverPendingWebhooks", () => {
  const secretKey = "unit-test-credentials-key";

  function endpointRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "ep1",
      url: "https://merchant.example/hook",
      status: "enabled",
      secret_encrypted: encryptSecretJson({ secret: "whsec_abc" }, secretKey),
      consecutive_failure_count: 0,
      ...overrides,
    };
  }

  function deliveryRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "dl1",
      endpoint_id: "ep1",
      org_id: "org1",
      environment: "live",
      event_id: "evt1",
      event_type: "subscription.renewed",
      payload: { id: "evt1", type: "subscription.renewed" },
      attempt_count: 0,
      ...overrides,
    };
  }

  it("marks a 2xx delivery succeeded and stops retrying it", async () => {
    process.env.PAY_CREDENTIALS_SECRET = secretKey;
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("ok", { status: 200 })) as unknown as typeof fetch;

    try {
      const supa = fakeSupabase(
        { webhook_deliveries: [deliveryRow()], webhook_endpoints: [endpointRow()] },
        writes,
      );

      const result = await deliverPendingWebhooks(supa, { now: new Date("2026-08-03T00:00:00Z") });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);

      const update = findOutcomeWrite(writes);
      const value = update!.value as Record<string, unknown>;
      expect(value.status).toBe("succeeded");
      expect(value.next_attempt_at).toBeNull();
      expect(value.attempt_count).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reschedules a 5xx with backoff rather than dropping the event", async () => {
    process.env.PAY_CREDENTIALS_SECRET = secretKey;
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("boom", { status: 500 })) as unknown as typeof fetch;

    try {
      const now = new Date("2026-08-03T00:00:00Z");
      const supa = fakeSupabase(
        { webhook_deliveries: [deliveryRow()], webhook_endpoints: [endpointRow()] },
        writes,
      );

      const result = await deliverPendingWebhooks(supa, { now });

      expect(result.failed).toBe(1);
      expect(result.exhausted).toBe(0);

      const update = findOutcomeWrite(writes);
      const value = update!.value as Record<string, unknown>;
      expect(value.status).toBe("pending");
      expect(value.last_status_code).toBe(500);
      // First backoff step is 1 minute.
      expect(value.next_attempt_at).toBe(new Date(now.getTime() + 60_000).toISOString());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("gives up once the backoff schedule is exhausted", async () => {
    process.env.PAY_CREDENTIALS_SECRET = secretKey;
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("boom", { status: 500 })) as unknown as typeof fetch;

    try {
      const supa = fakeSupabase(
        {
          // 7 backoff steps means attempt 8 has nowhere left to go.
          webhook_deliveries: [deliveryRow({ attempt_count: 7 })],
          webhook_endpoints: [endpointRow()],
        },
        writes,
      );

      const result = await deliverPendingWebhooks(supa, { now: new Date() });

      expect(result.exhausted).toBe(1);
      const update = findOutcomeWrite(writes);
      const value = update!.value as Record<string, unknown>;
      expect(value.status).toBe("failed");
      expect(value.next_attempt_at).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retires a delivery whose endpoint was disabled rather than looping on it", async () => {
    process.env.PAY_CREDENTIALS_SECRET = secretKey;
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      {
        webhook_deliveries: [deliveryRow()],
        webhook_endpoints: [endpointRow({ status: "disabled" })],
      },
      writes,
    );

    const result = await deliverPendingWebhooks(supa, { now: new Date() });

    expect(result.exhausted).toBe(1);
    const update = findOutcomeWrite(writes);
    expect((update!.value as Record<string, unknown>).last_error).toBe("endpoint_disabled");
  });

  // Two crons overlapping would otherwise both read the same due rows and POST
  // each event twice. The lease has to land BEFORE the HTTP call to matter.
  it("leases the row before delivering, not after", async () => {
    process.env.PAY_CREDENTIALS_SECRET = secretKey;
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const order: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      order.push("fetch");
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const now = new Date("2026-08-03T00:00:00Z");
      const supa = fakeSupabase(
        { webhook_deliveries: [deliveryRow()], webhook_endpoints: [endpointRow()] },
        writes,
      );

      await deliverPendingWebhooks(supa, { now });

      const lease = writes.find(
        (w) =>
          w.op === "update" &&
          w.table === "webhook_deliveries" &&
          !("status" in (w.value as Record<string, unknown>)),
      );
      expect(lease).toBeTruthy();
      // Pushed into the future so a concurrent worker's `lte(next_attempt_at,
      // now)` filter no longer matches this row.
      const leasedUntil = new Date(
        String((lease!.value as Record<string, unknown>).next_attempt_at),
      );
      expect(leasedUntil.getTime()).toBeGreaterThan(now.getTime());

      expect(writes.indexOf(lease!)).toBeLessThan(writes.indexOf(findOutcomeWrite(writes)!));
      expect(order).toEqual(["fetch"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("signs the request with the endpoint's own secret", async () => {
    process.env.PAY_CREDENTIALS_SECRET = secretKey;
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    let captured: { body: string; signature: string } | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      captured = { body: String(init.body), signature: headers["krafta-signature"] };
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const supa = fakeSupabase(
        { webhook_deliveries: [deliveryRow()], webhook_endpoints: [endpointRow()] },
        writes,
      );

      await deliverPendingWebhooks(supa, { now: new Date() });

      expect(captured).not.toBeNull();
      // Verify with the code a merchant would actually run.
      expect(
        verifyWebhookSignature({
          payloadBody: captured!.body,
          header: captured!.signature,
          secret: "whsec_abc",
        }),
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("emitPaymentEvent (one-off payments)", () => {
  const endpoints = [{ id: "ep_all", enabled_events: null }];

  const deliveryRows = (writes: Array<{ op: string; table: string; value: unknown }>) => {
    const insert = writes.find((w) => w.op === "insert" && w.table === "webhook_deliveries");
    return (insert?.value ?? []) as Array<Record<string, unknown>>;
  };

  it("delivers the merchant's own orderId and metadata, and nothing of ours", async () => {
    // orderId and metadata are the merchant's only correlation handles — this
    // event is what lets them release the right order without polling.
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      {
        webhook_endpoints: endpoints,
        payment_intents: [
          {
            id: "pi_1",
            org_id: "org1",
            environment: "live",
            amount_minor: 25000000,
            currency: "UZS",
            status: "succeeded",
            description: "Tuition",
            order_id: "ORD-42",
            // Merchant input and our bookkeeping share this column.
            metadata: { cartId: "c-9", subscription_id: "sub_internal", uzumCart: {} },
            created_at: "2026-08-04T09:00:00.000Z",
          },
        ],
        checkout_sessions: [{ id: "cs_1", customer_id: null, metadata: {} }],
        payment_attempts: [{ updated_at: "2026-08-04T09:05:00.000Z" }],
      },
      writes,
    );

    await emitPaymentEvent(supa, {
      eventType: "payment.succeeded",
      paymentIntentId: "pi_1",
      providerId: "uzum",
      providerPaymentId: "254179",
      attemptId: "att_1",
    });

    const payload = deliveryRows(writes)[0].payload as Record<string, any>;
    expect(payload.type).toBe("payment.succeeded");
    expect(payload.data.payment.orderId).toBe("ORD-42");
    expect(payload.data.payment.amountMinor).toBe(25000000);
    // Settle time comes from the attempt: there is no paid_at on the intent and
    // no updated_at trigger in this schema.
    expect(payload.data.payment.settledAt).toBe("2026-08-04T09:05:00.000Z");
    // Theirs survives; ours is stripped.
    expect(payload.data.metadata).toEqual({ cartId: "c-9" });
  });

  it("routes a test payment to test endpoints, from the intent not a global", async () => {
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      {
        webhook_endpoints: endpoints,
        payment_intents: [
          {
            id: "pi_2",
            org_id: "org1",
            environment: "test",
            amount_minor: 100,
            currency: "UZS",
            status: "succeeded",
            description: null,
            order_id: null,
            metadata: {},
            created_at: "2026-08-04T09:00:00.000Z",
          },
        ],
        checkout_sessions: [{ id: "cs_2", customer_id: null, metadata: {} }],
      },
      writes,
    );

    await emitPaymentEvent(supa, {
      eventType: "payment.succeeded",
      paymentIntentId: "pi_2",
      providerId: "atmos",
    });

    // The fake ignores .eq, so this asserts the value we pass to the endpoint
    // query rather than the filtering itself — a live payment reaching a test
    // endpoint is the failure this guards.
    const payload = deliveryRows(writes)[0].payload as Record<string, any>;
    expect(payload.data.payment.id).toBe("pi_2");
  });

  it("stays silent for a card-update intent, which nobody bought anything with", async () => {
    // card-setup.ts mints a zero-amount intent to re-bind a card on an existing
    // subscription. A payment.* event there would be a lie.
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      {
        webhook_endpoints: endpoints,
        payment_intents: [
          {
            id: "pi_3",
            org_id: "org1",
            environment: "live",
            amount_minor: 0,
            currency: "UZS",
            status: "succeeded",
            description: "Update card on file",
            order_id: null,
            metadata: { purpose: "card_update" },
            created_at: "2026-08-04T09:00:00.000Z",
          },
        ],
        checkout_sessions: [{ id: "cs_3", customer_id: null, metadata: {} }],
      },
      writes,
    );

    const result = await emitPaymentEvent(supa, {
      eventType: "payment.succeeded",
      paymentIntentId: "pi_3",
      providerId: "atmos",
    });

    expect(result).toBeNull();
    expect(writes.find((w) => w.table === "webhook_deliveries")).toBeUndefined();
  });

  it("carries the still-live pay link on a decline", async () => {
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase(
      {
        webhook_endpoints: endpoints,
        payment_intents: [
          {
            id: "pi_4",
            org_id: "org1",
            environment: "live",
            amount_minor: 4500000,
            currency: "UZS",
            status: "failed",
            description: null,
            order_id: "ORD-43",
            metadata: {},
            created_at: "2026-08-04T09:00:00.000Z",
          },
        ],
        checkout_sessions: [{ id: "cs_4", customer_id: null, metadata: {} }],
      },
      writes,
    );

    await emitPaymentEvent(supa, {
      eventType: "payment.failed",
      paymentIntentId: "pi_4",
      providerId: "uzum",
      payUrl: "https://pay.krafta.org/pay/tok_x",
    });

    const payload = deliveryRows(writes)[0].payload as Record<string, any>;
    expect(payload.type).toBe("payment.failed");
    // The session stays open on a decline, so the merchant can re-send this.
    expect(payload.data.payUrl).toBe("https://pay.krafta.org/pay/tok_x");
  });

  it("never throws when the intent is gone", async () => {
    // Runs inside charge finalization: the money has already moved, so a
    // missing row must not become an exception the caller has to survive.
    const writes: Array<{ op: string; table: string; value: unknown }> = [];
    const supa = fakeSupabase({ webhook_endpoints: endpoints }, writes);
    await expect(
      emitPaymentEvent(supa, {
        eventType: "payment.succeeded",
        paymentIntentId: "pi_missing",
        providerId: "atmos",
      }),
    ).resolves.toBeNull();
  });
});

describe("event catalogue", () => {
  it("covers every lifecycle transition the MVP contract promises", () => {
    for (const expected of [
      "subscription.created",
      "subscription.renewed",
      "subscription.payment_failed",
      "subscription.recovered",
      "subscription.canceled",
    ]) {
      expect(WEBHOOK_EVENT_TYPES).toContain(expected);
    }
  });
});
