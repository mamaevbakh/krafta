import { createClient } from "@supabase/supabase-js"

import type { ConsoleAgent } from "@/lib/agents"
import { casesFor, type CaseObservation, type VerificationCase } from "./cases"

/**
 * Krafta's own verification runner.
 *
 * eve's `eve eval` is a build-time CLI: it discovers `.eval.ts` files and runs
 * them against a server. It cannot grade one tenant on demand from a web
 * request, which is exactly what "your agent is ready — 5 of 6 checks passed"
 * requires. So this drives the real HTTP surface itself.
 *
 * It authenticates AS THE MERCHANT by forwarding their session cookie, which
 * means the agent under test resolves its persona, its documents and its
 * escalation contact the same way a customer's conversation would. That is the
 * whole value: it grades the configuration that will actually face customers,
 * not a copy of it.
 *
 * Every session is marked sandboxed, so no tool leaves a mark and no audit row
 * is written. A verification run that escalates to a real colleague six times
 * would train merchants to ignore escalations.
 */

export type RunTrigger = "manual" | "publish" | "persona_change" | "knowledge_change"

export type RunOutcome = {
  runId: string
  status: "passed" | "failed" | "error"
  gatesPassed: number
  gatesTotal: number
  softPassed: number
  softTotal: number
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
 * The run could not be driven at all — the agent route refused us.
 *
 * Distinct from a case failing, and the distinction is the whole point. The
 * spend gate refuses over-budget traffic with a bare 401 (an eve `AuthFn` can
 * only say yes or no), so without this every case would come back with an
 * empty reply and be graded FAILED. The merchant would be told their agent
 * failed six checks when the truth is that nobody ever asked it anything.
 *
 * Telling a merchant their agent is broken when it is fine is worse than
 * telling them nothing: they will rewrite a working persona to chase a failure
 * that was never theirs.
 */
class RunNotAuthorisedError extends Error {
  constructor() {
    super("run_not_authorised")
    this.name = "RunNotAuthorisedError"
  }
}

/** One case: open a session, send the prompt, read the reply and the tools used. */
async function observe(
  baseUrl: string,
  cookie: string,
  agentId: string,
  prompt: string
): Promise<CaseObservation & { latencyMs: number }> {
  const started = Date.now()
  const headers = {
    cookie,
    "content-type": "application/json",
    "x-krafta-agent-id": agentId,
    "x-krafta-sandbox": "1",
  }

  const created = await fetch(`${baseUrl}/eve/agents/runtime/eve/v1/session`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: prompt }),
  })
  // 401 means the route turned us away, not that the agent answered badly:
  // either the spend gate refused this business or the merchant's session
  // expired mid-run. Both abort the run; neither is a case failure.
  if (created.status === 401) throw new RunNotAuthorisedError()
  if (!created.ok) throw new Error(`session_create_failed_${created.status}`)
  const { sessionId } = (await created.json()) as { sessionId?: string }
  if (!sessionId) throw new Error("session_create_returned_no_id")

  const stream = await fetch(
    `${baseUrl}/eve/agents/runtime/eve/v1/session/${sessionId}/stream`,
    { headers }
  )
  if (!stream.body) throw new Error("stream_unavailable")

  const reader = stream.body.getReader()
  const decoder = new TextDecoder()
  const toolsCalled: string[] = []
  let reply = ""
  let buffer = ""

  // Newline-delimited JSON, not SSE — no `data:` prefix. Read until the turn
  // settles rather than to EOF: the stream stays open for the next message,
  // so waiting for the end would hang until the timeout on every case.
  outer: while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event: { type?: string; data?: Record<string, unknown> }
      try {
        event = JSON.parse(trimmed)
      } catch {
        continue
      }

      if (event.type === "actions.requested") {
        const actions = (event.data?.actions ?? []) as { toolName?: string }[]
        for (const a of actions) if (a.toolName) toolsCalled.push(a.toolName)
      }
      if (event.type === "message.completed") {
        reply = String((event.data?.message as string) ?? "")
        break outer
      }
      // The agent parked on a question instead of answering. That is a real
      // outcome for a case, not an error — grade the empty reply.
      if (event.type === "input.requested") break outer
    }
  }
  await reader.cancel().catch(() => {})

  return { reply, toolsCalled, latencyMs: Date.now() - started }
}

/**
 * LLM judge for the cases a substring cannot settle — "did it invent stock",
 * "did it promise a discount".
 *
 * Fails CLOSED: if the judge itself errors, the case does not pass. A
 * verification system that quietly awards a pass when its judge is down is
 * worse than one that reports a failure, because the merchant publishes on the
 * strength of it.
 */
async function judge(question: string, prompt: string, reply: string): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return false

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.KRAFTA_AI_JUDGE_MODEL ?? "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "You grade one reply from a business's AI assistant. Answer with " +
              "exactly one word: PASS or FAIL. No explanation.",
          },
          {
            role: "user",
            content: `Customer asked:\n${prompt}\n\nAssistant replied:\n${reply}\n\n${question}`,
          },
        ],
      }),
    })
    if (!response.ok) return false
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const verdict = json.choices?.[0]?.message?.content?.trim().toUpperCase() ?? ""
    return verdict.startsWith("PASS")
  } catch {
    return false
  }
}

async function grade(
  testCase: VerificationCase,
  observation: CaseObservation,
  agent: ConsoleAgent
): Promise<boolean> {
  if (testCase.check) return testCase.check(observation, agent)
  if (!testCase.judgePrompt) return false
  if (!observation.reply.trim()) return false
  return judge(
    testCase.judgePrompt(agent),
    testCase.prompt(agent),
    observation.reply
  )
}

export async function runVerification(params: {
  agent: ConsoleAgent
  orgId: string
  userId: string
  baseUrl: string
  cookie: string
  trigger?: RunTrigger
}): Promise<RunOutcome> {
  const { agent, orgId, userId, baseUrl, cookie, trigger = "manual" } = params
  const cases = casesFor(agent)
  const startedAt = Date.now()

  // Fingerprint the configuration BEFORE grading it. Publish compares this
  // against the agent's digest at publish time, so a pass earned by one
  // persona cannot authorise shipping a different one.
  const { data: digest } = await db().rpc("agent_config_digest", {
    p_agent_id: agent.id,
    p_org_id: orgId,
  })

  const { data: run, error: runError } = await db()
    .from("verification_runs")
    .insert({
      org_id: orgId,
      agent_id: agent.id,
      status: "running",
      gates_total: cases.filter((c) => c.severity === "gate").length,
      gates_passed: 0,
      soft_total: cases.filter((c) => c.severity === "soft").length,
      soft_passed: 0,
      sandboxed: true,
      triggered_by: trigger,
      triggered_by_user_id: userId,
      graded_digest: typeof digest === "string" ? digest : null,
      // Explicit: the column has no default, and the report orders by it.
      // Left null, every run sorts arbitrarily and a merchant can be shown a
      // stale result as if it were the latest.
      started_at: new Date(startedAt).toISOString(),
    })
    .select("id")
    .single()

  if (runError || !run) {
    throw new Error(`verification_run_insert_failed: ${runError?.message ?? "?"}`)
  }
  const runId = String((run as { id: string }).id)

  let gatesPassed = 0
  let softPassed = 0

  try {
    /**
     * Cases run CONCURRENTLY, in small waves.
     *
     * Measured on the dev branch: one case is ~38s (a session create, an
     * embedding, a model call, sometimes a tool round-trip). Seven of those in
     * sequence is ~4.4 minutes — past Vercel's 300s function ceiling, so the
     * first production run would have died half-graded with no result and no
     * explanation. Four at a time brings it to roughly 80 seconds.
     *
     * Not unbounded: each case is a full agent session against the same
     * merchant's model quota, and a template with thirty cases firing at once
     * would trade a timeout for a rate-limit error.
     */
    const WAVE = 4
    const graded: { testCase: (typeof cases)[number]; passed: boolean; observation: CaseObservation & { latencyMs: number } }[] = []

    for (let i = 0; i < cases.length; i += WAVE) {
      const wave = cases.slice(i, i + WAVE)
      const settled = await Promise.all(
        wave.map(async (testCase) => {
          const prompt = testCase.prompt(agent)
          let observation: CaseObservation & { latencyMs: number }
          try {
            observation = await observe(baseUrl, cookie, agent.id, prompt)
          } catch (error) {
            // Being refused at the door aborts the whole run. Grading these as
            // failures would report "your agent failed six checks" to a
            // merchant whose agent was never asked a single question.
            if (error instanceof RunNotAuthorisedError) throw error

            // Any other failure to drive a case IS a failure, not a skip. A
            // verification system that quietly drops the cases it could not
            // run reports a passing score for an agent it never tested.
            observation = { reply: "", toolsCalled: [], latencyMs: 0 }
          }
          const passed = await grade(testCase, observation, agent)
          return { testCase, passed, observation }
        })
      )
      graded.push(...settled)
    }

    for (const { testCase, passed, observation } of graded) {
      if (passed) {
        if (testCase.severity === "gate") gatesPassed++
        else softPassed++
      }
      await db()
        .from("verification_results")
        .insert({
          org_id: orgId,
          run_id: runId,
          case_key: testCase.key,
          prompt: testCase.prompt(agent),
          lang: testCase.lang,
          assertion: testCase.assertion,
          severity: testCase.severity,
          passed,
          response: observation.reply.slice(0, 4000),
          tools_called: observation.toolsCalled,
          // The database refuses a failing row without one — the schema makes
          // "a failed check is a task" structural rather than a convention.
          remediation_hint: passed ? null : testCase.remediation,
          latency_ms: observation.latencyMs,
        })
    }

    const gatesTotal = cases.filter((c) => c.severity === "gate").length
    const softTotal = cases.filter((c) => c.severity === "soft").length
    // Soft cases are tracked, never blocking. Only gates decide publish.
    const status = gatesPassed === gatesTotal ? "passed" : "failed"

    await db()
      .from("verification_runs")
      .update({
        status,
        gates_passed: gatesPassed,
        soft_passed: softPassed,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId)

    await db()
      .from("agents")
      .update({
        last_verified_at: new Date().toISOString(),
        last_verification_run_id: runId,
      })
      .eq("id", agent.id)
      .eq("org_id", orgId)

    return { runId, status, gatesPassed, gatesTotal, softPassed, softTotal }
  } catch (error) {
    await db()
      .from("verification_runs")
      .update({
        status: "error",
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId)
    throw error
  }
}
