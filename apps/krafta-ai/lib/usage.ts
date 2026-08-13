import { createClient } from "@supabase/supabase-js"

/**
 * Read model for what a business has spent and what it is allowed to spend.
 *
 * The runtime refuses over-budget traffic at the HTTP boundary, where an eve
 * `AuthFn` can only answer "yes" or "no" — a refusal reaches the browser as a
 * bare 401 that looks exactly like being signed out. So the console asks the
 * same database the same question and renders the real sentence. The runtime
 * is the enforcement; this is the explanation.
 *
 * Money here is in MICRO-DOLLARS, not so'm. Every figure on this path is what
 * Krafta pays OpenAI, in the currency OpenAI bills in — converting to UZS for
 * display would invent an exchange rate and imply the merchant is being charged
 * this, which they are not. What a merchant eventually pays Krafta is a
 * separate number that does not exist yet.
 */

export type QuotaReason =
  | "rate_limited"
  | "daily_turns_exhausted"
  | "monthly_budget_exhausted"
  | "budget_unconfigured"
  | "quota_check_failed"

export type UsageSummary = {
  /** Tashkent day — allowances reset at local midnight, not 05:00. */
  today: { turns: number; sessions: number; costMicros: number }
  month: { turns: number; sessions: number; costMicros: number }
  limits: {
    dailyTurnCap: number | null
    monthlyCostCapMicros: number | null
    perMinuteRequestCap: number | null
    alertThresholdPct: number
    unlimited: boolean
  }
  /** Null when the business is inside every limit. */
  blocked: { reason: QuotaReason } | null
  /** Unacknowledged budget warnings, newest first. */
  alerts: {
    id: string
    kind: "threshold" | "exhausted"
    thresholdPct: number | null
    costMicros: number
    capMicros: number
    raisedAt: string
  }[]
  /** Per-day rows for the current month, oldest first. */
  days: { day: string; turns: number; costMicros: number }[]
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

/**
 * The Tashkent calendar day, computed here rather than fetched.
 *
 * `agent.tashkent_day()` is the authority and the two must agree, but calling
 * it would be a round trip to learn today's date. `en-CA` because it formats as
 * YYYY-MM-DD, which is what the `date` column compares against.
 */
function tashkentDay(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`
}

/**
 * Everything the usage screen and the preview's budget banner need, in one
 * round of queries.
 *
 * Reads with the service key and an explicit `org_id` filter rather than
 * through the merchant's own session. Both would be correctly scoped — RLS
 * covers these tables — but the caller has already resolved the org through
 * `requireOrg`, and going through RLS here would mean this function silently
 * returns empty when called from a context without a user (a cron, a job)
 * rather than failing loudly.
 */
export async function getUsageSummary(orgId: string): Promise<UsageSummary> {
  const client = db()
  const today = tashkentDay()
  const from = monthStart(today)

  const [daysResult, limitsResult, alertsResult] = await Promise.all([
    client
      .from("usage_daily")
      .select("day, turns, sessions, cost_micros")
      .eq("org_id", orgId)
      .gte("day", from)
      .order("day", { ascending: true }),
    client.rpc("effective_budget", { p_org_id: orgId }),
    client
      .from("budget_alerts")
      .select("id, kind, threshold_pct, cost_micros, cap_micros, raised_at")
      .eq("org_id", orgId)
      .is("acknowledged_at", null)
      .order("raised_at", { ascending: false }),
  ])

  type DayRow = {
    day: string
    turns: number
    sessions: number
    cost_micros: number
  }
  const rows = (daysResult.data ?? []) as DayRow[]

  const todayRow = rows.find((r) => r.day === today)
  const month = rows.reduce(
    (acc, r) => ({
      turns: acc.turns + (r.turns ?? 0),
      sessions: acc.sessions + (r.sessions ?? 0),
      costMicros: acc.costMicros + (r.cost_micros ?? 0),
    }),
    { turns: 0, sessions: 0, costMicros: 0 }
  )

  // `effective_budget` is a set-returning function, so PostgREST hands back an
  // array even though it yields exactly one row.
  const budgetRow = (
    Array.isArray(limitsResult.data) ? limitsResult.data[0] : limitsResult.data
  ) as
    | {
        daily_turn_cap: number | null
        monthly_cost_cap_micros: number | null
        per_minute_request_cap: number | null
        alert_threshold_pct: number
        unlimited: boolean
      }
    | undefined

  const limits = {
    dailyTurnCap: budgetRow?.daily_turn_cap ?? null,
    monthlyCostCapMicros: budgetRow?.monthly_cost_cap_micros ?? null,
    perMinuteRequestCap: budgetRow?.per_minute_request_cap ?? null,
    alertThresholdPct: budgetRow?.alert_threshold_pct ?? 80,
    unlimited: budgetRow?.unlimited ?? false,
  }

  const todayUsage = {
    turns: todayRow?.turns ?? 0,
    sessions: todayRow?.sessions ?? 0,
    costMicros: todayRow?.cost_micros ?? 0,
  }

  // Mirrors agent.quota_check's cap arithmetic, minus the rate limit — a
  // per-minute burst is not a state worth reporting on a page the merchant
  // reads for ten seconds, and it will have cleared before they finish.
  //
  // This is a duplicate of logic that lives in SQL, which is a real cost: get
  // the comparison wrong here and the console says "you are fine" while the
  // agent refuses. Kept because the alternative — calling quota_check — would
  // CONSUME a rate-limit slot just to render a page.
  let blocked: { reason: QuotaReason } | null = null
  if (!budgetRow) {
    blocked = { reason: "budget_unconfigured" }
  } else if (
    limits.monthlyCostCapMicros !== null &&
    month.costMicros >= limits.monthlyCostCapMicros
  ) {
    blocked = { reason: "monthly_budget_exhausted" }
  } else if (
    limits.dailyTurnCap !== null &&
    todayUsage.turns >= limits.dailyTurnCap
  ) {
    blocked = { reason: "daily_turns_exhausted" }
  }

  type AlertRow = {
    id: string
    kind: "threshold" | "exhausted"
    threshold_pct: number | null
    cost_micros: number
    cap_micros: number
    raised_at: string
  }

  return {
    today: todayUsage,
    month,
    limits,
    blocked,
    alerts: ((alertsResult.data ?? []) as AlertRow[]).map((a) => ({
      id: a.id,
      kind: a.kind,
      thresholdPct: a.threshold_pct,
      costMicros: a.cost_micros,
      capMicros: a.cap_micros,
      raisedAt: a.raised_at,
    })),
    days: rows.map((r) => ({
      day: r.day,
      turns: r.turns ?? 0,
      costMicros: r.cost_micros ?? 0,
    })),
  }
}

/**
 * Micro-dollars as money a person can read.
 *
 * Two decimals below a dollar would render every real figure as "$0.00" in the
 * first weeks, which reads as "nothing is being recorded" rather than "this is
 * cheap". Small amounts therefore get the precision they need to be visibly
 * non-zero.
 */
export function formatUsd(micros: number): string {
  const dollars = micros / 1_000_000
  if (dollars === 0) return "$0.00"
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`
  if (dollars < 1) return `$${dollars.toFixed(3)}`
  return `$${dollars.toFixed(2)}`
}
