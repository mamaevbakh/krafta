import { createClient } from "@supabase/supabase-js"

import type { Localised, Severity } from "./cases"

export type VerificationResultRow = {
  id: string
  caseKey: string
  prompt: string
  lang: "uz" | "ru" | "en" | null
  assertion: Localised
  severity: Severity
  passed: boolean
  response: string | null
  toolsCalled: string[]
  remediation: Localised | null
  latencyMs: number | null
}

export type VerificationRunRow = {
  id: string
  agentId: string
  status: "queued" | "running" | "passed" | "failed" | "error" | "canceled"
  gatesTotal: number
  gatesPassed: number
  softTotal: number
  softPassed: number
  sandboxed: boolean
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  error: string | null
  results: VerificationResultRow[]
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

type Row = Record<string, unknown>

/**
 * The most recent run for an agent, with its results.
 *
 * Returns null when the agent has never been verified — a real state the
 * report renders as an invitation, not as a failure. Accusing an agent of
 * failing checks it was never put through is the bug the mock data had.
 */
export async function latestRun(
  orgId: string,
  agentId: string
): Promise<VerificationRunRow | null> {
  const { data: run } = await db()
    .from("verification_runs")
    .select(
      "id, agent_id, status, gates_total, gates_passed, soft_total, soft_passed, sandboxed, started_at, finished_at, duration_ms, error"
    )
    .eq("org_id", orgId)
    .eq("agent_id", agentId)
    // created_at is database-defaulted and therefore always present;
    // started_at is written by the runner. Ordering on both means a row
    // missing one still sorts correctly.
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!run) return null
  const r = run as unknown as Row
  const runId = String(r.id)

  const { data: results } = await db()
    .from("verification_results")
    .select(
      "id, case_key, prompt, lang, assertion, severity, passed, response, tools_called, remediation_hint, latency_ms"
    )
    .eq("org_id", orgId)
    .eq("run_id", runId)
    .order("severity", { ascending: true }) // 'gate' sorts before 'soft'
    .order("created_at", { ascending: true })

  const rows = (results ?? []) as unknown as Row[]

  return {
    id: runId,
    agentId: String(r.agent_id),
    status: String(r.status) as VerificationRunRow["status"],
    gatesTotal: Number(r.gates_total ?? 0),
    gatesPassed: Number(r.gates_passed ?? 0),
    softTotal: Number(r.soft_total ?? 0),
    softPassed: Number(r.soft_passed ?? 0),
    sandboxed: r.sandboxed === true,
    startedAt: String(r.started_at),
    finishedAt: (r.finished_at as string | null) ?? null,
    durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
    error: (r.error as string | null) ?? null,
    results: rows
      .map((row) => ({
        id: String(row.id),
        caseKey: String(row.case_key),
        prompt: String(row.prompt ?? ""),
        lang: (row.lang as VerificationResultRow["lang"]) ?? null,
        assertion: row.assertion as Localised,
        severity: String(row.severity) as Severity,
        passed: row.passed === true,
        response: (row.response as string | null) ?? null,
        toolsCalled: Array.isArray(row.tools_called)
          ? (row.tools_called as string[])
          : [],
        remediation: (row.remediation_hint as Localised | null) ?? null,
        latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
      }))
      // Failures first within their severity: the report exists to show the
      // owner what to fix, and making them hunt for it defeats the screen.
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "gate" ? -1 : 1
        return Number(a.passed) - Number(b.passed)
      }),
  }
}
