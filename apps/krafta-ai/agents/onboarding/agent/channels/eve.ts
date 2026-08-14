import { eveChannel } from "eve/channels/eve"
import { vercelOidc, type AuthFn } from "eve/channels/auth"

import { verifyAgentCaller } from "../lib/app-auth"
import { callerMayUseSession, sessionIdFromRequest } from "../lib/session-owner"
import { checkQuota } from "../lib/quota"

/**
 * Route auth for the tenant's agent.
 *
 * This replaces the scaffold's `[vercelOidc(), localDev(), placeholderAuth()]`.
 * That default is fail-closed — `placeholderAuth()` 401s every browser request
 * in production — which is why the deployment answered
 * `eve_production_auth_not_configured` until now.
 *
 * Order matters. The tenant check runs FIRST so a real merchant session always
 * wins; `vercelOidc()` follows to admit the deployment's own runtime callers
 * (subagents, internal fetches), which carry no tenant and must never be
 * mistaken for one.
 *
 * `localDev()` is deliberately NOT here. It authenticates a synthetic
 * principal with no `tenantId`, so on a laptop every tool would throw from
 * `requireTenantCaller` with a confusing error instead of a clean 401 — and
 * worse, it would mask a genuinely broken cookie path during development. Our
 * own auth works identically in dev, because the console calls the agent
 * same-origin and the browser sends the same session cookies.
 */
function tenantAppAuth(): AuthFn<Request> {
  return async (request) => {
    const caller = await verifyAgentCaller(request)
    if (caller === null) return null

    // Same session-authorisation gap as the runtime agent: eve authenticates
    // the caller and never the session. Lower stakes here — these are setup
    // conversations, not a merchant's customers — but the same fix, because a
    // business's own description of itself and what it plans to build is not
    // something another business gets to read.
    const sessionId = sessionIdFromRequest(request)
    if (sessionId !== null) {
      const mayUse = await callerMayUseSession(sessionId, caller.tenantId)
      if (!mayUse) {
        console.warn("[krafta-ai] cross-tenant session attach refused", {
          orgId: caller.tenantId,
          sessionId,
        })
        return null
      }
    }

    // Onboarding is gated on the same budget as the runtime agent, and against
    // the same counters. It is a real model conversation — "describe your
    // business and I'll build the agent" is the most expensive single turn in
    // the product — so leaving this door uncapped would make the cap on the
    // other door decorative. See lib/quota.ts.
    const quota = await checkQuota(request, caller.tenantId)
    if (!quota.allowed) {
      console.warn("[krafta-ai] onboarding request refused", {
        orgId: caller.tenantId,
        reason: quota.reason,
        scope: quota.scope,
      })
      return null
    }

    return {
      authenticator: "app",
      issuer: "https://ai.krafta.uz",
      principalId: caller.userId,
      principalType: "user",
      subject: caller.userId,
      // Routing facts only. Never a secret, and never anything the model is
      // allowed to influence — `requireTenantCaller` trusts this completely.
      attributes: {
        tenantId: caller.tenantId,
        role: caller.role,
        // A hint for which of this tenant's agents to compose. Re-filtered by
        // org_id downstream, so it cannot reach across businesses.
        ...(caller.agentId ? { agentId: caller.agentId } : {}),
        // Auth attributes are string-only (RuntimeSessionAuthAttributes),
        // so this is "1" rather than a boolean.
        ...(caller.sandboxed ? { sandboxed: "1" } : {}),
      },
    }
  }
}

export default eveChannel({
  auth: [tenantAppAuth(), vercelOidc()],
})
