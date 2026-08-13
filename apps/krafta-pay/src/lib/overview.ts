import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What a merchant actually opens the dashboard to find out.
 *
 * The old overview answered "have you finished setting up?" — a three-column
 * grid of onboarding steps. Galaktika opens this to answer «сколько мне
 * заплатили» and «кто ещё не заплатил», and got a checklist for developers.
 *
 * The existing metrics module is deliberately left alone: MRR, churn and
 * recovery rate are the right numbers for a SaaS operator reasoning about a
 * subscription business. They are the wrong numbers for a language school with
 * forty students, who thinks in "this month" and "who owes me".
 *
 * ON THE MONEY CLOCK. payment_intents has no paid_at column and nothing in the
 * payments schema has an updated_at trigger, so an intent's updated_at is older
 * than the charge that settled it. The ATTEMPT is stamped on settle, which is
 * why every "when did this money land" question here reads the succeeded
 * attempt rather than the intent. Same reasoning as resolvePaidAt in
 * payments-list.ts; if that changes, change both.
 */

export type OverviewRow = {
  paymentIntentId: string;
  description: string | null;
  customerLabel: string | null;
  amountMinor: number;
  currency: string;
  /** `failed` reads as declined; `awaiting` as never attempted. */
  kind: "failed" | "awaiting";
  createdAt: string;
  /** Present only while the payment can still be completed. */
  payUrl: string | null;
};

export type OverviewData = {
  currency: string;
  collectedThisMonthMinor: number;
  collectedLastMonthMinor: number;
  outstandingMinor: number;
  needsAttentionCount: number;
  /** Oldest first, six entries, for the chart. */
  monthly: Array<{ month: string; collectedMinor: number }>;
  /** Most overdue first. */
  rows: OverviewRow[];
};

/** Month key in UTC, e.g. "2026-08". Stable across the merchant's timezone. */
export function monthKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last `count` month keys, oldest first, ending with the month of `now`. */
export function recentMonths(now: Date, count = 6): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

/**
 * Percentage change, or null when there is nothing to compare against.
 *
 * Null rather than 0 or Infinity on purpose: a merchant's first month has no
 * previous month, and "+100%" or "+∞%" both read as a result rather than as an
 * absence. The UI shows nothing at all in that case.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

type IntentRow = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  description: string | null;
  created_at: string;
};

/** Statuses where nobody has paid yet and the merchant may still be paid. */
const AWAITING = new Set(["requires_payment_method", "requires_action"]);

export async function loadOverview(
  admin: SupabaseClient,
  params: {
    orgId: string;
    environment: "test" | "live";
    payBaseUrl: string;
    now?: Date;
  },
): Promise<OverviewData> {
  const now = params.now ?? new Date();
  const months = recentMonths(now, 6);
  // Six months back from the first day of the earliest month we display.
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString();

  const { data: intentsData, error: intentsErr } = await admin
    .schema("payments")
    .from("payment_intents")
    .select("id, status, amount_minor, currency, description, created_at")
    .eq("org_id", params.orgId)
    .eq("environment", params.environment)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (intentsErr) throw intentsErr;
  const intents = (intentsData ?? []) as IntentRow[];

  const byId = new Map(intents.map((i) => [i.id, i]));
  const intentIds = intents.map((i) => i.id);

  // When the money actually landed — see the note on the money clock above.
  const settledAt = new Map<string, string>();
  if (intentIds.length) {
    const { data: attempts, error: attemptsErr } = await admin
      .schema("payments")
      .from("payment_attempts")
      .select("payment_intent_id, status, updated_at")
      .in("payment_intent_id", intentIds)
      .eq("status", "succeeded");
    if (attemptsErr) throw attemptsErr;
    for (const a of (attempts ?? []) as Array<{
      payment_intent_id: string;
      updated_at: string | null;
    }>) {
      if (!a.updated_at) continue;
      const prev = settledAt.get(a.payment_intent_id);
      if (!prev || a.updated_at > prev) settledAt.set(a.payment_intent_id, a.updated_at);
    }
  }

  // A still-open checkout session is what makes a payment recoverable: it is
  // the link the merchant can re-send. Without one there is nothing to offer.
  const openToken = new Map<string, string>();
  if (intentIds.length) {
    const { data: sessions, error: sessionsErr } = await admin
      .schema("payments")
      .from("checkout_sessions")
      .select("payment_intent_id, public_token, status")
      .in("payment_intent_id", intentIds)
      .eq("status", "open");
    if (sessionsErr) throw sessionsErr;
    for (const s of (sessions ?? []) as Array<{
      payment_intent_id: string;
      public_token: string;
    }>) {
      if (!openToken.has(s.payment_intent_id)) openToken.set(s.payment_intent_id, s.public_token);
    }
  }

  const collectedByMonth = new Map<string, number>();
  for (const [intentId, when] of settledAt) {
    const intent = byId.get(intentId);
    if (!intent) continue;
    const key = monthKey(when);
    collectedByMonth.set(key, (collectedByMonth.get(key) ?? 0) + intent.amount_minor);
  }

  const thisMonth = monthKey(now);
  const lastMonth = months[months.length - 2] ?? thisMonth;

  let outstandingMinor = 0;
  const rows: OverviewRow[] = [];
  for (const intent of intents) {
    const status = intent.status.toLowerCase();
    const isFailed = status === "failed";
    const isAwaiting = AWAITING.has(status);
    if (!isFailed && !isAwaiting) continue;

    outstandingMinor += intent.amount_minor;
    const token = openToken.get(intent.id) ?? null;
    rows.push({
      paymentIntentId: intent.id,
      description: intent.description,
      customerLabel: null,
      amountMinor: intent.amount_minor,
      currency: intent.currency,
      kind: isFailed ? "failed" : "awaiting",
      createdAt: intent.created_at,
      payUrl: token ? `${params.payBaseUrl.replace(/\/+$/, "")}/pay/${token}` : null,
    });
  }

  // Oldest first: the longer someone has owed, the more it needs chasing.
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    currency: intents[0]?.currency ?? "UZS",
    collectedThisMonthMinor: collectedByMonth.get(thisMonth) ?? 0,
    collectedLastMonthMinor: collectedByMonth.get(lastMonth) ?? 0,
    outstandingMinor,
    needsAttentionCount: rows.length,
    monthly: months.map((month) => ({
      month,
      collectedMinor: collectedByMonth.get(month) ?? 0,
    })),
    rows: rows.slice(0, 25),
  };
}
