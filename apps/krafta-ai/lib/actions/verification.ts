"use server"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"

import { getAgent } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"
import { getUsageSummary } from "@/lib/usage"
import { runVerification, type RunTrigger } from "@/lib/verification/runner"

export type StartRunResult =
  | { ok: true; runId: string; status: string; gatesPassed: number; gatesTotal: number }
  | { ok: false; error: string }

/**
 * Starts a verification run for one of this business's agents.
 *
 * Runs inline rather than on a queue. Measured: ~80s for seven cases graded
 * four at a time — long for a request, but short for someone who just pressed
 * a button and is watching, and a queue would need a job table, a worker and a
 * polling UI to deliver the same thing.
 *
 * This is close enough to Vercel's 300s ceiling to matter. A template with
 * twenty cases, or a slower model, and it must move to a background job — see
 * D1b. Do not add cases without re-measuring.
 */
export async function startVerificationRun(
  agentId: string,
  trigger: RunTrigger = "manual"
): Promise<StartRunResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "not_signed_in" }

  const org = await getSelectedOrg()
  if (!org) return { ok: false, error: "no_business_selected" }

  // Scoped by organisation, so an agent id from another business resolves to
  // nothing rather than being graded on this merchant's behalf.
  const agent = await getAgent(org.id, agentId)
  if (!agent) return { ok: false, error: "agent_not_found" }

  // Ask about the budget BEFORE starting, because a run is seven real
  // conversations and the spend gate would refuse them one 401 at a time. The
  // runner aborts cleanly on that, but the merchant would still have waited,
  // watched a run fail, and been given a reason phrased as an HTTP outcome.
  // The error strings here are budget reasons the console already has
  // sentences for, so the message they read is about their limit and not about
  // our plumbing.
  const usage = await getUsageSummary(org.id)
  if (usage.blocked) return { ok: false, error: usage.blocked.reason }

  // The runner calls the agent over real HTTP as this merchant, so it needs
  // their cookie and an absolute origin. Reading the forwarded host keeps this
  // correct on a preview deployment and on ai.krafta.uz without an env var to
  // forget.
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  const proto = headerList.get("x-forwarded-proto") ?? "http"
  if (!host) return { ok: false, error: "cannot_resolve_origin" }

  const jar = await cookies()
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ")

  try {
    const outcome = await runVerification({
      agent,
      orgId: org.id,
      userId: user.id,
      baseUrl: `${proto}://${host}`,
      cookie: cookieHeader,
      trigger,
    })

    revalidatePath("/[locale]/agents/[id]/verification", "page")
    revalidatePath("/[locale]/agents", "page")

    return {
      ok: true,
      runId: outcome.runId,
      status: outcome.status,
      gatesPassed: outcome.gatesPassed,
      gatesTotal: outcome.gatesTotal,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "run_failed",
    }
  }
}
