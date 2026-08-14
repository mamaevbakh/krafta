import { defineHook } from "eve/hooks"

import { recordSessionOwner } from "../lib/session-owner"

/**
 * Records which business started this conversation.
 *
 * Half of the fix for the one hole every other layer misses. eve authenticates
 * the caller on every request and never authorises the SESSION — the id is in
 * the URL and nothing compares it to whoever is asking. RLS, the per-request
 * membership check and the 404-never-403 rule all protect the DATA; a
 * conversation is addressed directly by id, so it goes around all of them.
 *
 * This hook writes the owner. `channels/eve.ts` reads it back and refuses a
 * caller from another business. Neither half works alone.
 *
 * Observe-only, like every hook, and here that is a real weakness worth naming:
 * if this write fails, the session simply has no owner row, and an unowned
 * session is treated as new — so it stays reachable by anyone holding the id.
 * The check fails OPEN on a missing row by necessity (a session being created
 * has no row yet), which means the recorder failing silently degrades the
 * guarantee rather than breaking the conversation. That is the right trade for
 * a customer conversation, and it is the reason this write is retried on the
 * cheapest possible path rather than being clever.
 */
export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const caller = ctx.session.auth.current
      const tenantId = caller?.attributes.tenantId
      // No verified tenant means we cannot say who owns it, and guessing is
      // worse than leaving it unowned: a wrong owner would lock the rightful
      // business out of its own conversation.
      if (typeof tenantId !== "string") return

      const sessionId = ctx.session.id
      if (typeof sessionId !== "string" || sessionId === "") return

      const agentId = caller?.attributes.agentId
      await recordSessionOwner({
        sessionId,
        orgId: tenantId,
        userId: typeof caller?.principalId === "string" ? caller.principalId : null,
        agentId: typeof agentId === "string" ? agentId : null,
        sandboxed: caller?.attributes.sandboxed === "1",
      })
    },
  },
})
