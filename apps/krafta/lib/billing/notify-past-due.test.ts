import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Billing notification sweeps. Two sweeps share one idempotency table + one
 * Telegram dispatch path:
 *  - notifyPastDueSubscriptions: one message per past_due sub, once ever.
 *  - notifyExpiringCards (proactive): warn active subs whose card expires this
 *    month / next / already past, once per specific expiry month, skipping
 *    cards that expire comfortably in the future.
 * Both must never resend across cron ticks and never throw when no venue has
 * Telegram connected.
 */

type Pm = { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null };

type Fixture = {
  pastDueSubs: Array<{ id: string; customers: { customer_org_id: string | null } | null }>;
  activeSubs: Array<{
    id: string;
    default_payment_method_id: string | null;
    customers: { customer_org_id: string | null } | null;
  }>;
  paymentMethods: Record<string, Pm>;
  venuesByOrg: Record<string, Array<{ id: string }>>;
  telegramTargets: Record<string, { botToken: string; chatId: string } | null>;
  sendOk: Record<string, boolean>;
  notified: Set<string>; // `${subscriptionId}:${eventType}`
  sendCalls: Array<{ chatId: string; text: string }>;
};

let fixture: Fixture;

function resetFixture() {
  fixture = {
    pastDueSubs: [],
    activeSubs: [],
    paymentMethods: {},
    venuesByOrg: {},
    telegramTargets: {},
    sendOk: {},
    notified: new Set(),
    sendCalls: [],
  };
}
resetFixture();

// Chainable + thenable Supabase fake. Each call builds its own instance so
// .eq()/.not() filters accumulate on that instance without leaking.
function makeFakeClient() {
  function builder(table: string) {
    const filters: Record<string, string> = {};
    const b: any = {
      select: () => b,
      eq: (col: string, val: string) => {
        filters[col] = val;
        return b;
      },
      not: () => b,
      order: () => b,
      limit: () => b,
      insert: (row: { subscription_id: string; event_type: string }) => {
        if (table === "subscription_payment_notifications") {
          fixture.notified.add(`${row.subscription_id}:${row.event_type}`);
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => {
        if (table === "subscription_payment_notifications") {
          const key = `${filters.subscription_id}:${filters.event_type}`;
          return Promise.resolve({
            data: fixture.notified.has(key) ? { subscription_id: filters.subscription_id } : null,
            error: null,
          });
        }
        if (table === "payment_methods") {
          return Promise.resolve({ data: fixture.paymentMethods[filters.id] ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        let data: unknown = null;
        if (table === "subscriptions") {
          data = filters.status === "active" ? fixture.activeSubs : fixture.pastDueSubs;
        }
        if (table === "venues") data = fixture.venuesByOrg[filters.org_id] ?? [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return b;
  }
  return {
    schema: () => ({ from: (table: string) => builder(table) }),
    from: (table: string) => builder(table),
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => makeFakeClient(),
}));

vi.mock("@/lib/telegram/settings", () => ({
  getVenueTelegramTargetForDispatch: vi.fn(async (venueId: string) => {
    return fixture.telegramTargets[venueId] ?? null;
  }),
}));

vi.mock("@/lib/telegram/bot-api", () => ({
  escapeHtml: (s: string) => s,
  sendTelegramMessage: vi.fn(async (_token: string, input: { chatId: string; text: string }) => {
    fixture.sendCalls.push({ chatId: input.chatId, text: input.text });
    return {
      ok: fixture.sendOk[input.chatId] !== false,
      error: fixture.sendOk[input.chatId] === false ? "boom" : undefined,
    };
  }),
}));

beforeEach(() => {
  resetFixture();
  process.env.KRAFTA_SUPABASE_URL = "https://example.test";
  process.env.KRAFTA_SUPABASE_SECRET_KEY = "test-key";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("notifyPastDueSubscriptions", () => {
  it("sends one Telegram message for a past_due subscription with a connected venue", async () => {
    const { notifyPastDueSubscriptions } = await import("./notify-past-due");
    fixture.pastDueSubs = [{ id: "sub1", customers: { customer_org_id: "org1" } }];
    fixture.venuesByOrg.org1 = [{ id: "venue1" }];
    fixture.telegramTargets.venue1 = { botToken: "tok", chatId: "chat1" };
    fixture.sendOk.chat1 = true;

    const result = await notifyPastDueSubscriptions();

    expect(result).toEqual({ scanned: 1, notified: 1, skippedNoTelegram: 0 });
    expect(fixture.sendCalls).toHaveLength(1);
    expect(fixture.notified.has("sub1:past_due")).toBe(true);
  });

  it("skips (but still marks notified) when no venue has Telegram connected", async () => {
    const { notifyPastDueSubscriptions } = await import("./notify-past-due");
    fixture.pastDueSubs = [{ id: "sub2", customers: { customer_org_id: "org2" } }];
    fixture.venuesByOrg.org2 = [{ id: "venue2" }];
    fixture.telegramTargets.venue2 = null;

    const result = await notifyPastDueSubscriptions();

    expect(result).toEqual({ scanned: 1, notified: 0, skippedNoTelegram: 1 });
    expect(fixture.sendCalls).toHaveLength(0);
    expect(fixture.notified.has("sub2:past_due")).toBe(true);
  });

  it("does not resend once already marked notified", async () => {
    const { notifyPastDueSubscriptions } = await import("./notify-past-due");
    fixture.pastDueSubs = [{ id: "sub3", customers: { customer_org_id: "org3" } }];
    fixture.venuesByOrg.org3 = [{ id: "venue3" }];
    fixture.telegramTargets.venue3 = { botToken: "tok", chatId: "chat3" };
    fixture.sendOk.chat3 = true;
    fixture.notified.add("sub3:past_due");

    const result = await notifyPastDueSubscriptions();

    expect(result).toEqual({ scanned: 1, notified: 0, skippedNoTelegram: 0 });
    expect(fixture.sendCalls).toHaveLength(0);
  });
});

describe("notifyExpiringCards", () => {
  // now = 2026-07-15 → threshold covers cards expiring <= 2026-08.
  const NOW = new Date("2026-07-15T00:00:00Z");

  it("warns once for a card expiring this month", async () => {
    const { notifyExpiringCards } = await import("./notify-past-due");
    fixture.activeSubs = [
      { id: "subA", default_payment_method_id: "pmA", customers: { customer_org_id: "orgA" } },
    ];
    fixture.paymentMethods.pmA = { brand: "Visa", last4: "4364", exp_month: 7, exp_year: 2026 };
    fixture.venuesByOrg.orgA = [{ id: "venueA" }];
    fixture.telegramTargets.venueA = { botToken: "tok", chatId: "chatA" };
    fixture.sendOk.chatA = true;

    const result = await notifyExpiringCards(undefined, NOW);

    expect(result).toEqual({ scanned: 1, notified: 1, skippedNoTelegram: 0 });
    expect(fixture.sendCalls).toHaveLength(1);
    expect(fixture.sendCalls[0].text).toContain("4364");
    expect(fixture.notified.has("subA:card_expiring:2026-07")).toBe(true);
  });

  it("warns for a card expiring next month", async () => {
    const { notifyExpiringCards } = await import("./notify-past-due");
    fixture.activeSubs = [
      { id: "subB", default_payment_method_id: "pmB", customers: { customer_org_id: "orgB" } },
    ];
    fixture.paymentMethods.pmB = { brand: "Visa", last4: "1111", exp_month: 8, exp_year: 2026 };
    fixture.venuesByOrg.orgB = [{ id: "venueB" }];
    fixture.telegramTargets.venueB = { botToken: "tok", chatId: "chatB" };
    fixture.sendOk.chatB = true;

    const result = await notifyExpiringCards(undefined, NOW);

    expect(result.notified).toBe(1);
    expect(fixture.notified.has("subB:card_expiring:2026-08")).toBe(true);
  });

  it("does NOT warn for a card expiring comfortably in the future", async () => {
    const { notifyExpiringCards } = await import("./notify-past-due");
    fixture.activeSubs = [
      { id: "subC", default_payment_method_id: "pmC", customers: { customer_org_id: "orgC" } },
    ];
    fixture.paymentMethods.pmC = { brand: "Visa", last4: "2222", exp_month: 12, exp_year: 2027 };
    fixture.venuesByOrg.orgC = [{ id: "venueC" }];
    fixture.telegramTargets.venueC = { botToken: "tok", chatId: "chatC" };
    fixture.sendOk.chatC = true;

    const result = await notifyExpiringCards(undefined, NOW);

    expect(result).toEqual({ scanned: 0, notified: 0, skippedNoTelegram: 0 });
    expect(fixture.sendCalls).toHaveLength(0);
  });

  it("warns for an already-expired card (defensive)", async () => {
    const { notifyExpiringCards } = await import("./notify-past-due");
    fixture.activeSubs = [
      { id: "subD", default_payment_method_id: "pmD", customers: { customer_org_id: "orgD" } },
    ];
    fixture.paymentMethods.pmD = { brand: "Visa", last4: "3333", exp_month: 1, exp_year: 2026 };
    fixture.venuesByOrg.orgD = [{ id: "venueD" }];
    fixture.telegramTargets.venueD = { botToken: "tok", chatId: "chatD" };
    fixture.sendOk.chatD = true;

    const result = await notifyExpiringCards(undefined, NOW);

    expect(result.notified).toBe(1);
    expect(fixture.notified.has("subD:card_expiring:2026-01")).toBe(true);
  });

  it("does not resend for the same expiry month across ticks", async () => {
    const { notifyExpiringCards } = await import("./notify-past-due");
    fixture.activeSubs = [
      { id: "subE", default_payment_method_id: "pmE", customers: { customer_org_id: "orgE" } },
    ];
    fixture.paymentMethods.pmE = { brand: "Visa", last4: "4444", exp_month: 7, exp_year: 2026 };
    fixture.venuesByOrg.orgE = [{ id: "venueE" }];
    fixture.telegramTargets.venueE = { botToken: "tok", chatId: "chatE" };
    fixture.sendOk.chatE = true;
    fixture.notified.add("subE:card_expiring:2026-07");

    const result = await notifyExpiringCards(undefined, NOW);

    expect(result.notified).toBe(0);
    expect(fixture.sendCalls).toHaveLength(0);
  });

  it("skips a subscription whose payment method has no expiry data", async () => {
    const { notifyExpiringCards } = await import("./notify-past-due");
    fixture.activeSubs = [
      { id: "subF", default_payment_method_id: "pmF", customers: { customer_org_id: "orgF" } },
    ];
    fixture.paymentMethods.pmF = { brand: "Atmos", last4: null, exp_month: null, exp_year: null };

    const result = await notifyExpiringCards(undefined, NOW);

    expect(result).toEqual({ scanned: 0, notified: 0, skippedNoTelegram: 0 });
  });
});
