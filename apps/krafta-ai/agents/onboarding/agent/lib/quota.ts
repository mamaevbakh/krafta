import { createClient } from "@supabase/supabase-js"

/**
 * The spend gate. The only place a conversation can be refused before it costs
 * money.
 *
 * WHY IT LIVES IN THE AUTH FUNCTION AND NOT IN A HOOK
 *
 * eve hooks are observe-only — its own guide says so, and a hook that throws
 * surfaces as `turn.failed` only AFTER the event is durably recorded, which is
 * after the model call has been paid for. The channel's auth function is the
 * one thing that runs at the HTTP boundary before eve starts a turn, so it is
 * the one thing that can say no.
 *
 * That placement has a cost worth naming: an `AuthFn` may return only a
 * session context or null, so a refusal here becomes a bare 401 that looks
 * exactly like being signed out. The console therefore asks the database the
 * same question BEFORE it opens a preview and renders the real reason. This
 * function is the enforcement; the console's copy is the explanation. If the
 * two ever disagree, this one wins, because this one is the one holding the
 * card.
 */

/**
 * Why a business was refused. The console maps each of these to a sentence in
 * the merchant's own language, so adding one here means adding it to all three
 * locale catalogues too.
 */
export const QUOTA_REASONS = [
  "rate_limited",
  "daily_turns_exhausted",
  "monthly_budget_exhausted",
  "budget_unconfigured",
  "quota_check_failed",
] as const

export type QuotaReason = (typeof QUOTA_REASONS)[number]

export type QuotaVerdict =
  | { allowed: true }
  | {
      allowed: false
      reason: QuotaReason
      scope?: string
      retryAfterSeconds?: number
      used?: number
      cap?: number
      usedMicros?: number
      capMicros?: number
    }

/**
 * The database is a separate deployable from this code. Treat its `reason` as
 * untrusted input rather than assuming the two are in step: a migration that
 * adds a reason string this build has never heard of must degrade to a generic
 * refusal, not produce a verdict the console cannot render.
 */
function asQuotaReason(value: unknown): QuotaReason {
  return QUOTA_REASONS.includes(value as QuotaReason)
    ? (value as QuotaReason)
    : "quota_check_failed"
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

/**
 * The caller's address, for the per-source rate limit.
 *
 * Only the FIRST entry of x-forwarded-for is used. The header is a
 * client-appendable list, so trusting the last entry — or joining them — lets
 * anyone mint a fresh rate-limit identity per request by sending their own
 * header. On Vercel the first entry is the one the platform wrote.
 *
 * Returning null when there is no header is deliberate: the org-scoped limit
 * still applies, and inventing a placeholder key would lump every unknown
 * caller into one bucket and rate-limit them as if they were one person.
 */
function callerIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const real = request.headers.get("x-real-ip")
  return real ? real.trim().slice(0, 64) : null
}

/**
 * Asks the database whether this business may spend right now.
 *
 * FAILS CLOSED. If the check itself errors we refuse, and that is not the
 * usual availability-versus-safety trade because it costs almost nothing here:
 * this runs in the same request as `verifyAgentCaller`, which already made two
 * Supabase calls. If the database is unreachable, the caller was never going to
 * be authenticated in the first place. So failing closed adds no new outage
 * mode, and failing open would mean a database blip is also the moment every
 * spending limit silently stops existing.
 *
 * Verification runs are NOT exempt. A run is seven real conversations against a
 * real model and costs real money; exempting sandboxed traffic would leave the
 * single most automatable path through the product uncapped.
 */
export async function checkQuota(
  request: Request,
  orgId: string
): Promise<QuotaVerdict> {
  const client = db()
  if (!client) return { allowed: false, reason: "quota_check_failed" }

  const { data, error } = await client.rpc("quota_check", {
    p_org_id: orgId,
    p_ip: callerIp(request),
  })

  if (error || !data || typeof data !== "object") {
    return { allowed: false, reason: "quota_check_failed" }
  }

  const verdict = data as Record<string, unknown>
  if (verdict.allowed === true) return { allowed: true }

  return {
    allowed: false,
    reason: asQuotaReason(verdict.reason),
    scope: typeof verdict.scope === "string" ? verdict.scope : undefined,
    retryAfterSeconds:
      typeof verdict.retry_after_seconds === "number"
        ? verdict.retry_after_seconds
        : undefined,
    used: typeof verdict.used === "number" ? verdict.used : undefined,
    cap: typeof verdict.cap === "number" ? verdict.cap : undefined,
    usedMicros:
      typeof verdict.used_micros === "number" ? verdict.used_micros : undefined,
    capMicros:
      typeof verdict.cap_micros === "number" ? verdict.cap_micros : undefined,
  }
}

/**
 * Charges a completed model step to the business.
 *
 * Called from the usage hook, which cannot refuse anything — by the time this
 * runs the tokens are already spent. Its job is to make the NEXT
 * `checkQuota` tell the truth.
 *
 * Never throws. A hook that throws surfaces as `turn.failed`, so a hiccup in
 * the metering path would break a conversation the customer is having. Losing
 * one turn's accounting is the cheaper failure — and the platform-wide cap at
 * the provider is the backstop for exactly this case.
 */
export async function recordTurnUsage(params: {
  orgId: string
  /** TOTAL input the provider reported, cached portion included. */
  inputTokens: number
  /** The cached SUBSET of `inputTokens`. Priced lower, never added on top. */
  cachedInputTokens?: number
  outputTokens: number
  turns?: number
  sessions?: number
}): Promise<void> {
  const client = db()
  if (!client) return

  try {
    await client.rpc("record_turn_usage", {
      p_org_id: params.orgId,
      p_input_tokens: Math.max(0, Math.round(params.inputTokens || 0)),
      p_cached_input_tokens: Math.max(
        0,
        Math.round(params.cachedInputTokens || 0)
      ),
      p_output_tokens: Math.max(0, Math.round(params.outputTokens || 0)),
      p_turns: params.turns ?? 1,
      p_sessions: params.sessions ?? 0,
    })
  } catch {
    // Deliberately swallowed. See the note above.
  }
}
