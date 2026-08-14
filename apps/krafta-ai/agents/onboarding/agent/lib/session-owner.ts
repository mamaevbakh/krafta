import { createClient } from "@supabase/supabase-js"

/**
 * Session ownership — the only thing stopping one business attaching to
 * another business's conversation.
 *
 * eve authenticates who is calling and never authorises the session itself.
 * There is no session-forbidden error anywhere in its compiled output, because
 * the concept does not exist in the framework: route authorization is the
 * deployer's job and its docs say so. So a session id in a URL is a secret,
 * and a secret is not an access control — it degrades the moment it is logged,
 * screenshotted, pasted into a support ticket, or leaked via a referrer.
 */

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

/** Writes the owner of a new session. Write-once: never reassigns an org. */
export async function recordSessionOwner(params: {
  sessionId: string
  orgId: string
  userId: string | null
  agentId: string | null
  sandboxed: boolean
}): Promise<void> {
  try {
    await admin().rpc("record_session_owner", {
      p_session_id: params.sessionId,
      p_org_id: params.orgId,
      p_user_id: params.userId,
      p_agent_id: params.agentId,
      p_sandboxed: params.sandboxed,
    })
  } catch {
    // Never break a live conversation to write a bookkeeping row. The cost of
    // this failing is a session with no owner, which the check treats as new
    // and therefore leaves reachable — a degraded guarantee, not a broken one.
    // Deliberate: the alternative is a merchant's customer hitting an error
    // because our audit table was briefly unreachable.
  }
}

/**
 * May this caller touch this session?
 *
 * FAILS CLOSED on an error, and that is the opposite of the recorder above,
 * on purpose. If we cannot tell whose conversation this is, the safe answer is
 * no — and it costs nothing extra in practice, because the same request has
 * already made two Supabase calls to authenticate the caller. If the database
 * is unreachable, the caller was never going to get past `getUser()` anyway.
 *
 * An UNKNOWN session id passes. That is required, not sloppy: a session being
 * created has no row yet, and refusing unknown ids would break every new
 * conversation. It grants nothing, because an id with no row references no
 * existing conversation — the row appears as the session starts, and from that
 * moment the check bites.
 */
export async function callerMayUseSession(
  sessionId: string,
  orgId: string
): Promise<boolean> {
  try {
    const { data, error } = await admin().rpc("session_belongs_to_org", {
      p_session_id: sessionId,
      p_org_id: orgId,
    })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

/**
 * Pulls the session id out of an agent request, or null if it names none.
 *
 * eve's routes are `/eve/v1/session/:id/...` under whatever prefix the agent is
 * mounted at, so this matches the segment after `session/` rather than
 * assuming a fixed depth — the mount prefix differs between the named-agent
 * layout (`/eve/agents/runtime/eve/v1/...`) and a bare one, and hard-coding an
 * index would silently stop matching if that ever changed. A check that
 * silently stops matching is worse than no check, because it still looks
 * present in the code.
 */
export function sessionIdFromRequest(request: Request): string | null {
  let pathname: string
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return null
  }

  const match = /\/session\/([^/?#]+)/.exec(pathname)
  if (!match) return null

  const id = decodeURIComponent(match[1]).trim()
  return id === "" ? null : id
}
