import "server-only";

/**
 * Quota helpers for the Localization Workbench.
 *
 * Two surfaces share the same underlying table `public.catalog_translation_quotas`:
 *
 * 1. **Enqueue-time check** (this file) — called from Next.js server actions.
 *    Runs as the authenticated user; reads-only via standard Supabase client.
 *    Returns a soft yes/no based on `used_today + requested vs daily_quota`.
 *    Race-tolerant: at scale a few extra translations slipping past the cap
 *    is acceptable for a soft cost limit. Strict enforcement would need a
 *    SERIALIZABLE transaction with row-lock — overkill at our scale.
 *
 * 2. **Post-completion increment** (worker side, NOT here) — runs in the
 *    Supabase Edge Function via service-role client. Lives in
 *    supabase/functions/translate-worker/index.ts. Bumps used_today +
 *    total_tokens_used + total_usd_estimated. Skipped jobs DO NOT increment
 *    (human-edit guard blocked the write).
 *
 * The quota table row is created lazily — first enqueue for a catalog auto-
 * inserts a row with default daily_quota=500 if none exists.
 */

import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type QuotaCheckResult =
  | { ok: true; quotaRemaining: number; dailyQuota: number; usedToday: number }
  | {
      ok: false;
      error: "QUOTA_EXCEEDED";
      quotaRemaining: number;
      dailyQuota: number;
      usedToday: number;
      requested: number;
    };

/**
 * Read-only "quota" check. Currently no cap is enforced — KRA-92 removed
 * the 500/day limit. This function still reads the tracking row so the
 * UI can show usage / cost data, but always returns ok:true.
 *
 * Left intact (vs deleted) for two reasons:
 *   1. Easy re-enablement of per-tier caps later by uncommenting the
 *      `if (requested > quotaRemaining)` branch below.
 *   2. The function still surfaces useful data (usedToday, dailyQuota) to
 *      the caller, which the UI consumes to render the "X translations
 *      today" counter.
 */
export async function checkQuota(
  client: SupabaseClient<Database>,
  params: { catalogId: string; requested: number },
): Promise<QuotaCheckResult> {
  // `requested` is unused in unlimited mode — referenced for callsite stability.
  void params.requested;
  const { catalogId } = params;

  const { data, error } = await client
    .from("catalog_translation_quotas")
    .select("daily_quota, used_today, quota_reset_at")
    .eq("catalog_id", catalogId)
    .maybeSingle();

  if (error) {
    // Soft-fail on RLS errors etc. — the tracking is informational only now.
    return {
      ok: true,
      quotaRemaining: Number.MAX_SAFE_INTEGER,
      dailyQuota: 1_000_000,
      usedToday: 0,
    };
  }

  const dailyQuota = data?.daily_quota ?? 1_000_000;
  const rawUsedToday = data?.used_today ?? 0;

  // If the reset window has passed but the cron hasn't fired, treat
  // used_today as 0 — same self-healing behavior we kept for tracking.
  const resetAt = data?.quota_reset_at ? new Date(data.quota_reset_at) : null;
  const usedToday =
    resetAt && resetAt.getTime() < Date.now() ? 0 : rawUsedToday;

  // KRA-92: cap removed. Re-enable by uncommenting:
  //
  //   const quotaRemaining = dailyQuota - usedToday;
  //   if (requested > quotaRemaining) {
  //     return { ok: false, error: "QUOTA_EXCEEDED", quotaRemaining, dailyQuota, usedToday, requested };
  //   }
  //
  // For now: always pass; surface tracking for the UI.
  return {
    ok: true,
    quotaRemaining: Number.MAX_SAFE_INTEGER,
    dailyQuota,
    usedToday,
  };
}

/**
 * Ensure a quota row exists for the catalog. Idempotent.
 * Called by enqueue server actions before first insertion of a job for a
 * catalog so the worker has a row to increment later.
 */
export async function ensureQuotaRow(
  client: SupabaseClient<Database>,
  catalogId: string,
): Promise<void> {
  // Use upsert with onConflict to handle the race where two enqueue
  // requests arrive simultaneously for a catalog with no row yet.
  await client
    .from("catalog_translation_quotas")
    .upsert(
      { catalog_id: catalogId },
      { onConflict: "catalog_id", ignoreDuplicates: true },
    );
}
