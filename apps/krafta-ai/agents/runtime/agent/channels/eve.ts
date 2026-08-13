import { eveChannel } from "eve/channels/eve"
import { vercelOidc, type AuthFn } from "eve/channels/auth"

import { verifyAgentCaller } from "../lib/app-auth"
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

    // The spend gate, and the reason it is here rather than in a hook: this is
    // the last point before eve starts a turn, and eve hooks are observe-only.
    // See lib/quota.ts.
    //
    // A refusal is indistinguishable from "not signed in" from here — an
    // AuthFn can only return a context or null. That is why the console asks
    // the same question itself and renders the real sentence; this is the
    // enforcement, not the explanation.
    const quota = await checkQuota(request, caller.tenantId)
    if (!quota.allowed) {
      // Server-side only. The merchant never sees this string; it is what
      // makes a 401 in the logs readable six weeks from now, when the
      // question is "why did this business stop working on Tuesday".
      console.warn("[krafta-ai] agent request refused", {
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
