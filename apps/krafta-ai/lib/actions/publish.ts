"use server"

import { revalidatePath } from "next/cache"
import { createClient as createAdmin } from "@supabase/supabase-js"

import { getAgent } from "@/lib/agents"
import { getSelectedOrg } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"

export type PublishResult =
  | { ok: true; versionId: string; version: number }
  | { ok: false; reason: PublishBlockReason; detail?: string }

export type PublishBlockReason =
  | "not_signed_in"
  | "no_business_selected"
  | "agent_not_found"
  | "never_verified"
  | "gates_failing"
  | "config_changed_since_verification"
  | "write_failed"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createAdmin(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

/**
 * Composes the system prompt stored on the published snapshot.
 *
 * `agents_live_needs_prompt_check` refuses a live agent without one, which is
 * the schema insisting that "published" means a fixed, inspectable artefact
 * rather than a row that happens to be flagged. The runtime still assembles
 * the live prompt per session from the tenant's row — this is the record of
 * what was approved, and what a rollback restores.
 */
function composePrompt(agent: {
  businessName: string | null
  name: string
  persona: string | null
  hoursText: string | null
  tone: string | null
  escalationContact: string | null
  languages: string[]
  defaultLanguage: string
}): string {
  const lines = [`# ${agent.businessName ?? agent.name}`, ""]
  if (agent.persona?.trim()) lines.push(agent.persona.trim(), "")
  if (agent.hoursText?.trim()) lines.push(`## Working hours`, agent.hoursText.trim(), "")
  if (agent.tone?.trim()) lines.push(`## Tone`, agent.tone.trim(), "")
  if (agent.languages.length > 0) {
    lines.push(
      `## Languages`,
      `Serves: ${agent.languages.join(", ")}. Default when ambiguous: ${agent.defaultLanguage}.`,
      ""
    )
  }
  if (agent.escalationContact?.trim()) {
    lines.push(`## Handing over`, `Escalate to ${agent.escalationContact.trim()}.`, "")
  }
  return lines.join("\n").trim()
}

/**
 * Publishes an agent — the moment it becomes something customers can reach.
 *
 * Every precondition is re-checked HERE. The report disables the button when
 * gates fail, but a disabled button is a courtesy, not a gate: anyone can call
 * a server action directly. The three refusals below are the actual gate.
 *
 * The third one is the subtle one. A merchant can pass verification, edit the
 * persona to something nobody graded, and publish — unless the pass is tied to
 * the configuration it was earned on. `graded_digest` makes that structural.
 */
export async function publishAgent(agentId: string): Promise<PublishResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: "not_signed_in" }

  const org = await getSelectedOrg()
  if (!org) return { ok: false, reason: "no_business_selected" }

  const agent = await getAgent(org.id, agentId)
  if (!agent) return { ok: false, reason: "agent_not_found" }

  const db = admin()

  const { data: run } = await db
    .from("verification_runs")
    .select("id, status, gates_passed, gates_total, graded_digest")
    .eq("org_id", org.id)
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!run) return { ok: false, reason: "never_verified" }

  const latest = run as unknown as {
    id: string
    status: string
    gates_passed: number
    gates_total: number
    graded_digest: string | null
  }

  if (latest.status !== "passed" || latest.gates_passed < latest.gates_total) {
    return {
      ok: false,
      reason: "gates_failing",
      detail: `${latest.gates_passed}/${latest.gates_total}`,
    }
  }

  const { data: currentDigest } = await db.rpc("agent_config_digest", {
    p_agent_id: agentId,
    p_org_id: org.id,
  })

  // Fails CLOSED on a missing digest, deliberately. A run that did not record
  // which configuration it graded cannot prove it graded THIS one, and
  // treating "unknown" as "fine" is how a pass earned on one persona ends up
  // shipping another. Runs from before digests existed therefore require a
  // re-run — which costs a merchant ninety seconds and is the honest answer.
  if (
    typeof currentDigest !== "string" ||
    latest.graded_digest !== currentDigest
  ) {
    return { ok: false, reason: "config_changed_since_verification" }
  }

  const compiledPrompt = composePrompt(agent)

  const { data: lastVersion } = await db
    .from("agent_versions")
    .select("version")
    .eq("org_id", org.id)
    .eq("agent_id", agentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion =
    Number((lastVersion as { version?: number } | null)?.version ?? 0) + 1

  const { data: version, error: versionError } = await db
    .from("agent_versions")
    .insert({
      org_id: org.id,
      agent_id: agentId,
      version: nextVersion,
      name: agent.name,
      template_slug: agent.templateSlug,
      channel: agent.channel,
      channel_ref: "",
      languages: agent.languages,
      default_language: agent.defaultLanguage,
      persona: agent.persona,
      compiled_prompt: compiledPrompt,
      model: agent.model,
      business_name: agent.businessName,
      hours_text: agent.hoursText,
      tone: agent.tone,
      escalation_contact: agent.escalationContact,
      verification_run_id: latest.id,
      published_at: new Date().toISOString(),
      published_by: user.id,
      created_by: user.id,
    })
    .select("id, version")
    .single()

  if (versionError || !version) {
    return {
      ok: false,
      reason: "write_failed",
      detail: versionError?.message?.slice(0, 200),
    }
  }

  const versionId = String((version as { id: string }).id)

  const { error: agentError } = await db
    .from("agents")
    .update({
      status: "live",
      compiled_prompt: compiledPrompt,
      live_version_id: versionId,
      published_at: new Date().toISOString(),
    })
    .eq("id", agentId)
    .eq("org_id", org.id)

  if (agentError) {
    return { ok: false, reason: "write_failed", detail: agentError.message.slice(0, 200) }
  }

  revalidatePath("/[locale]/agents", "page")
  revalidatePath("/[locale]/agents/[id]/verification", "page")
  revalidatePath("/[locale]", "page")

  return { ok: true, versionId, version: nextVersion }
}
