import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Commerce SDK — service-role client factory.
 *
 * This is the seed of the "free the engine" layer (Krafta Studio step 1):
 * the storefront's commerce behavior is being lifted out of the React tree
 * into a reusable, framework-agnostic SDK that the Studio agent — and, later,
 * any headless surface — reads from. For now it exposes read-only catalog
 * facts; cart/checkout/order facades land here next, always preserving the
 * server-authoritative pricing path.
 *
 * Returns null when the service-role environment is not configured so callers
 * can fail soft with a clear message instead of throwing at import time.
 */
export function getCommerceAdminClient() {
  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
