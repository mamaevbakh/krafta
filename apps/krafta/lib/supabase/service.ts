import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * service.ts — a service-role Supabase client for trusted server work that must
 * bypass RLS and read authoritatively (billing entitlement, gating primitives).
 *
 * Never expose this to the browser and never use it to read/write on behalf of
 * an unauthenticated caller without first authorizing the target org yourself.
 * Mirrors the credential resolution already used by lib/payments/settings.ts so
 * env parity holds across the app.
 */
export function createServiceClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("missing_supabase_service_credentials");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
