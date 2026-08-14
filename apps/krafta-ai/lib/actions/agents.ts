"use server"

import { revalidatePath } from "next/cache"
import { createClient as createAdmin } from "@supabase/supabase-js"

import { getSelectedOrg } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"

export type CreateAgentResult =
  | { ok: true; agentId: string }
  | { ok: false; error: string }

/** Only these reach the database — anything else in the form is ignored. */
type SetupAnswers = {
  business: string
  hours: string
  languages: string[]
  escalation: string
  tone: string
  channel: string
}

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
 * The wizard's language step offers the console's own locale codes; the
 * database constrains document language to a wider set including both Uzbek
 * scripts. Keep the agent's `languages` to what the wizard can actually
 * produce so a typo in the form cannot write an unknown code.
 */
const ALLOWED_LANGUAGES = new Set(["uz", "ru", "en"])
const ALLOWED_CHANNELS = new Set(["web", "telegram", "widget"])
const ALLOWED_AUDIENCES = new Set(["customers", "businesses", "staff", "mixed"])

/**
 * What the onboarding interview learned, as it arrives from the browser.
 *
 * Every field is `unknown` on purpose. This travels through localStorage and
 * a client component, so it is a REQUEST, not a fact — the same reasoning as
 * the org cookie. It cannot reach another business (the org still comes from
 * the session), but it does end up in the agent's prompt, so an unbounded
 * string here is an unbounded prompt and a stale tab is a wrong persona.
 */
export type InterviewPayload = Record<string, unknown>

/** Trimmed, length-capped string, or undefined if there is nothing useful. */
function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

/**
 * A short list of short phrases.
 *
 * Both bounds matter and for different reasons: the per-item cap stops one
 * pasted essay becoming a bullet, and the list cap stops a model that decided
 * to be thorough from writing forty of them into every future prompt.
 */
function boundedList(value: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((v) => boundedText(v, maxLen))
    .filter((v): v is string => v !== undefined)
    .slice(0, maxItems)
  return items.length > 0 ? items : undefined
}

/**
 * Reduces the interview to the facts worth keeping, discarding anything else.
 *
 * Stored under `settings.interview` rather than as new columns, which buys one
 * thing that matters: `agent.agent_config_digest()` already hashes
 * `settings::text`, so changing who the agent serves — or what it must never
 * do — invalidates a passing verification run exactly the way editing the
 * persona does. New columns would have silently escaped that gate.
 */
function sanitiseInterview(payload: InterviewPayload | undefined) {
  if (!payload || typeof payload !== "object") return null

  const audience =
    typeof payload.audience === "string" && ALLOWED_AUDIENCES.has(payload.audience)
      ? payload.audience
      : undefined

  const interview = {
    audience,
    handles: boundedList(payload.handles, 12, 160),
    mustNotDo: boundedList(payload.mustNotDo, 12, 160),
    needsLookups: boundedList(payload.needsLookups, 12, 160),
    hasIntegration:
      typeof payload.hasIntegration === "boolean" ? payload.hasIntegration : undefined,
    needsIntegrationHelp:
      typeof payload.needsIntegrationHelp === "boolean"
        ? payload.needsIntegrationHelp
        : undefined,
    integrationNotes: boundedText(payload.integrationNotes, 2000),
    businessSummary: boundedText(payload.businessSummary, 600),
    rationale: boundedText(payload.rationale, 600),
  }

  // Drop the keys that resolved to nothing so `settings` records what was
  // actually established, not a form full of nulls.
  const kept = Object.fromEntries(
    Object.entries(interview).filter(([, v]) => v !== undefined)
  )
  return Object.keys(kept).length > 0 ? kept : null
}

/**
 * Creates a draft agent from the setup wizard.
 *
 * Status is `draft`, deliberately. `agents_live_needs_prompt_check` refuses a
 * live agent without a compiled prompt, and more importantly nothing should go
 * live before a verification run has passed — publishing is a separate,
 * gated act (C1a/D2), not the end of a form.
 *
 * The organisation comes from the session, never the form. A hidden org field
 * would let anyone create agents inside another merchant's business.
 */
export async function createAgentFromSetup(
  templateSlug: string,
  raw: Record<string, string | string[]>,
  /** What the onboarding interview established, when they came in that door. */
  interview?: InterviewPayload
): Promise<CreateAgentResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "not_signed_in" }

  const org = await getSelectedOrg()
  if (!org) return { ok: false, error: "no_business_selected" }

  const pick = (key: string): string => {
    const value = raw[key]
    return (Array.isArray(value) ? value[0] : value ?? "").trim()
  }
  const pickAll = (key: string): string[] => {
    const value = raw[key]
    return (Array.isArray(value) ? value : value ? [value] : []).map((v) =>
      String(v).trim()
    )
  }

  const answers: SetupAnswers = {
    business: pick("business"),
    hours: pick("hours"),
    languages: pickAll("languages").filter((l) => ALLOWED_LANGUAGES.has(l)),
    escalation: pick("escalation"),
    tone: pick("tone"),
    channel: pick("channel"),
  }

  if (!answers.business) return { ok: false, error: "business_name_required" }

  const languages = answers.languages.length > 0 ? answers.languages : ["uz"]
  const channel = ALLOWED_CHANNELS.has(answers.channel)
    ? answers.channel
    : "web"

  const captured = sanitiseInterview(interview)

  const { data, error } = await admin()
    .from("agents")
    .insert({
      org_id: org.id,
      name: answers.business,
      business_name: answers.business,
      template_slug: templateSlug,
      status: "draft",
      channel,
      // Empty object rather than null when there was no interview: `settings`
      // feeds agent_config_digest, and a null there would make every
      // template-grid agent hash differently from an identical interview one.
      settings: captured ? { interview: captured } : {},
      // A per-org address is only meaningful once a channel is connected;
      // the schema's global uniqueness index treats '' as "no address yet".
      channel_ref: "",
      languages,
      default_language: languages[0],
      hours_text: answers.hours || null,
      tone: answers.tone || null,
      escalation_contact: answers.escalation || null,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message?.slice(0, 200) ?? "insert_failed" }
  }

  revalidatePath("/[locale]/agents", "page")
  revalidatePath("/[locale]", "page")
  return { ok: true, agentId: String((data as { id: string }).id) }
}
