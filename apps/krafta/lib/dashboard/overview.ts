/**
 * overview.ts — the Overview page's shared metric layer. Every number the
 * dashboard home shows (today's revenue, order count, average check, the
 * 7-day bars, top items) is derived HERE, from one definition, so the
 * Overview and the Orders page can never disagree.
 *
 * Revenue = "goods sold": the sum of line-item totals over orders in a
 * REVENUE_STATE. This matches the Orders page total exactly (a pure line-item
 * sum, no taxes/fees/tips folded in). When Krafta Pay card rails land, a
 * separate "cash collected" figure (from commerce.order_payments) becomes a
 * sibling metric — but "Выручка / Revenue" stays goods-sold unless we decide
 * otherwise, explicitly.
 *
 * All *_cents columns store major-units × 100 for EVERY currency, UZS
 * included (25,000 сум → 2,500,000 cents). Never format a raw value — always
 * go through formatPriceCents.
 */

// Orders that count toward revenue. 'draft' (in-flight carts) and 'canceled'
// never do. 'open' is a live order (goods committed); 'completed' is closed.
export const REVENUE_STATES = ["open", "completed"] as const;
export type RevenueState = (typeof REVENUE_STATES)[number];

// Tunable heuristics — deliberately named so the first real Tashkent merchants
// can retune them without a code hunt. See the Overview design open questions.
export const MIN_HISTORY_DAYS = 7; // deltas hidden until the shop is this old
export const MIN_COMPARISON_ORDERS = 3; // …and the comparison day had ≥ this many
export const MIN_AVG_CHECK_ORDERS = 3; // average check shows '—' below this today
export const INSIGHT_GATE_ORDERS_7D = 10; // 7-day chart/top-items gate
export const TODAY_FETCH_LIMIT = 500; // hard cap; hitting it flips to "500+"

/** The minimal order shape the metric helpers need. */
export type MetricOrder = {
  state: string;
  createdAt: string;
  lineItems: Array<{ quantity: number; totalPriceCents: number; name?: string }>;
};

export function isRevenueOrder(state: string): boolean {
  return (REVENUE_STATES as readonly string[]).includes(state);
}

/** Σ of a single order's line-item totals. */
export function orderTotalCents(order: {
  lineItems: Array<{ totalPriceCents: number }>;
}): number {
  return order.lineItems.reduce((sum, li) => sum + (li.totalPriceCents ?? 0), 0);
}

export type DayMetrics = {
  revenueCents: number;
  orders: number;
  avgCheckCents: number | null; // null when below MIN_AVG_CHECK_ORDERS
};

/** Aggregate a set of orders (already scoped to a day) into the three KPIs. */
export function aggregateDay(orders: MetricOrder[]): DayMetrics {
  const revenueOrders = orders.filter((o) => isRevenueOrder(o.state));
  const revenueCents = revenueOrders.reduce(
    (sum, o) => sum + orderTotalCents(o),
    0,
  );
  const count = revenueOrders.length;
  return {
    revenueCents,
    orders: count,
    avgCheckCents:
      count >= MIN_AVG_CHECK_ORDERS ? Math.round(revenueCents / count) : null,
  };
}

/**
 * The local calendar-day key ("YYYY-MM-DD") for an instant, in the venue's
 * timezone. Used to bucket orders into days without any manual UTC math —
 * Intl does the timezone conversion. Two orders 10 minutes either side of
 * local midnight land in the correct (different) buckets.
 */
export function localDateKey(iso: string, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, exactly the key shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Milliseconds the given timezone is ahead of UTC at `date`. Robust across
 * DST because it reads the offset AT that instant. (Asia/Tashkent is a fixed
 * UTC+5, but we don't hard-code that.)
 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/**
 * The UTC instant of the most recent local midnight in the venue's timezone.
 * This is the lower bound for the "today" order query.
 */
export function venueDayStartUtc(now: Date, timeZone: string): Date {
  const key = localDateKey(now.toISOString(), timeZone); // YYYY-MM-DD (local)
  const [y, m, d] = key.split("-").map(Number);
  // Local midnight expressed as if it were UTC, minus the tz offset, gives the
  // true UTC instant of that local midnight.
  const naiveUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset);
}

/**
 * The ordered list of the last `count` local-day keys ending today (index 0 =
 * oldest, last = today). Used to lay out the 7-day bars with correct weekday
 * labels and to look up the same-weekday-last-week baseline (key at -7).
 */
export function recentDayKeys(
  now: Date,
  timeZone: string,
  count: number,
): string[] {
  const todayStart = venueDayStartUtc(now, timeZone).getTime();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    // Step back i local days. 26h back from a local midnight, re-normalized to
    // that day's local key, is DST-safe; for a fixed-offset tz it's exact.
    const dayInstant = new Date(todayStart - i * 24 * 60 * 60 * 1000);
    keys.push(localDateKey(dayInstant.toISOString(), timeZone));
  }
  return keys;
}

/** Short weekday label ("Mon", "Tue", …) for a YYYY-MM-DD key. */
export function weekdayLabel(dayKey: string, locale = "en-US"): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    new Date(Date.UTC(y, m - 1, d, 12, 0, 0)),
  );
}

export type TopItem = { name: string; qty: number; revenueCents: number };

/**
 * Rank items by revenue across the given orders (already scoped to a window +
 * revenue states by the caller). Grouped by the snapshot name so a since-
 * renamed or deleted item still aggregates correctly.
 */
export function topItems(orders: MetricOrder[], limit = 5): TopItem[] {
  const byName = new Map<string, TopItem>();
  for (const order of orders) {
    if (!isRevenueOrder(order.state)) continue;
    for (const li of order.lineItems) {
      const name = (li.name ?? "").trim() || "—";
      const entry = byName.get(name) ?? { name, qty: 0, revenueCents: 0 };
      entry.qty += li.quantity ?? 0;
      entry.revenueCents += li.totalPriceCents ?? 0;
      byName.set(name, entry);
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, limit);
}

/** Percentage delta a→b, or null when the baseline is too small to trust. */
export function deltaPercent(
  current: number,
  baseline: number,
  baselineOrders: number,
): number | null {
  if (baselineOrders < MIN_COMPARISON_ORDERS) return null;
  if (baseline <= 0) return null;
  return Math.round(((current - baseline) / baseline) * 100);
}
