import { createServerClient } from "@supabase/ssr"

/** Must match ORG_COOKIE in the console's lib/orgs.ts. */
const ORG_COOKIE = "krafta_ai_org"

export type TenantCaller = {
  userId: string
  tenantId: string
  role: string
  /**
   * Which of the tenant's agents this session is for. A HINT, not an
   * authorisation: it is client-supplied and is re-filtered by `org_id` in
   * `loadAgentConfig`, so naming another business's agent resolves to nothing
   * and falls back to their own. Never treat it as proof of anything.
   */
  agentId: string | null
  /**
   * True when this session is a verification run rather than a real
   * conversation. Tools must not cause external effects, and the audit log
   * must not fill with test traffic.
   */
  sandboxed: boolean
}

/**
 * Parses a Cookie header into the {name, value} pairs @supabase/ssr expects.
 *
 * Cookie values are percent-encoded and Supabase's chunked auth cookies are
 * base64 blobs, so split on the FIRST "=" only — splitting on every "="
 * truncates the token and the session silently fails to verify.
 */
function parseCookies(header: string | null): { name: string; value: string }[] {
  if (!header) return []
  return header
    .split(";")
    .map((part) => {
      const raw = part.trim()
      if (!raw) return null
      const eq = raw.indexOf("=")
      if (eq < 1) return null
      return {
        name: raw.slice(0, eq),
        value: decodeURIComponent(raw.slice(eq + 1)),
      }
    })
    .filter((c): c is { name: string; value: string } => c !== null)
}

/**
 * Turns the browser's Krafta session into a verified tenant caller, or null.
 *
 * Two independent checks, and both matter:
 *
 *  1. `getUser()` — validates the access token against Supabase rather than
 *     trusting the cookie. `getSession()` would NOT do this; it decodes the
 *     cookie locally, so a forged one would pass.
 *
 *  2. Membership — the org id arrives in a cookie the browser controls, so it
 *     is a *request*, not a fact. It is re-checked against
 *     `organization_members` on every call. This function runs per HTTP
 *     request, which means session create AND every continue, so a user
 *     removed from a business mid-conversation stops being able to act for it
 *     on their next turn rather than at some cache expiry.
 *
 * The membership query runs as the USER (publishable key + their cookies), not
 * as service_role. RLS on `organization_members` then does the scoping for us:
 * if they are not a member, the row simply is not visible, so a bug here fails
 * closed instead of granting access.
 */
export async function verifyAgentCaller(
  request: Request
): Promise<TenantCaller | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null

  const cookies = parseCookies(request.headers.get("cookie"))
  if (cookies.length === 0) return null

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookies,
      // The agent runtime never rotates the session; the console's proxy.ts
      // owns that. Writing cookies from here would race it.
      setAll: () => {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const requested = cookies.find((c) => c.name === ORG_COOKIE)?.value

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)

  if (error || !memberships || memberships.length === 0) return null

  // Honour the selected business only if they really belong to it. An
  // unrecognised or absent cookie falls back to their first membership rather
  // than erroring — same reasoning as the console: naming a business they
  // cannot reach must not be distinguishable from naming one that does not
  // exist.
  const chosen =
    memberships.find((m) => m.org_id === requested) ?? memberships[0]

  // The console names the agent it is previewing. Header first (survives the
  // POST body), query string as the fallback for EventSource-style GETs that
  // cannot set headers.
  const agentId =
    request.headers.get("x-krafta-agent-id") ??
    new URL(request.url).searchParams.get("agentId")

  return {
    userId: user.id,
    tenantId: chosen.org_id,
    role: String(chosen.role),
    agentId: agentId && agentId.trim() !== "" ? agentId : null,
    // Set by the verification runner only. It is a header, so a customer on
    // the public widget could in principle send it — which is harmless: it
    // only ever REMOVES capability (no side effects, no audit row), never
    // grants any.
    sandboxed: request.headers.get("x-krafta-sandbox") === "1",
  }
}
