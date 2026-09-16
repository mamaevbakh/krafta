import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

/**
 * Service-role client for schema `tasnif`, server only.
 *
 * The schema grants nothing to `anon` or `authenticated`: a browser holding
 * Krafta's public key gets "permission denied for schema tasnif". Every search
 * therefore passes through this app's route handlers, which is where rate
 * limits and caching live. kraftabase also serves Krafta's shops and payments,
 * so an open RPC anyone could hammer is exactly what this avoids.
 *
 * Before launch this should become a role that can only execute
 * tasnif.search and read tasnif tables, instead of the service role, which can
 * read every schema (see PLAN.md, Risks).
 */
export function tasnifDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set for apps/tasnif")
  }
  return createClient<Database, "tasnif">(url, key, {
    db: { schema: "tasnif" },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
