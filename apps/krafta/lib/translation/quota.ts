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
 * Read-only quota check. Call BEFORE inserting into translation_jobs.
 *
 * Behavior:
 * - If no row exists for the catalog, returns ok with full default quota
 *   (500). The actual row is inserted when the first job is enqueued OR by
 *   the worker on first increment — we don't write here to keep this
 *   function pure.
 * - If used_today + requested > daily_quota → returns ok:false with details.
 * - quota_reset_at is checked: if it's in the past, treats used_today as 0
 *   (the cron job that resets the counter may not have fired yet).
 */
export async function checkQuota(
  client: SupabaseClient<Database>,
  params: { catalogId: string; requested: number },
): Promise<QuotaCheckResult> {
  const { catalogId, requested } = params;

  const { data, error } = await client
    .from("catalog_translation_quotas")
    .select("daily_quota, used_today, quota_reset_at")
    .eq("catalog_id", catalogId)
    .maybeSingle();

  if (error) {
    // Soft-fail on RLS errors etc. — let the enqueue proceed and the
    // worker decide. Better than blocking a legitimate user on a quota
    // table read bug.
    return {
      ok: true,
      quotaRemaining: 500,
      dailyQuota: 500,
      usedToday: 0,
    };
  }

  const dailyQuota = data?.daily_quota ?? 500;
  const rawUsedToday = data?.used_today ?? 0;

  // If the reset window has passed but the cron hasn't fired, treat
  // used_today as 0. Worst case: a slightly generous burst right after
  // midnight. Better than blocking legitimate work.
  const resetAt = data?.quota_reset_at ? new Date(data.quota_reset_at) : null;
  const usedToday =
    resetAt && resetAt.getTime() < Date.now() ? 0 : rawUsedToday;

  const quotaRemaining = dailyQuota - usedToday;

  if (requested > quotaRemaining) {
    return {
      ok: false,
      error: "QUOTA_EXCEEDED",
      quotaRemaining,
      dailyQuota,
      usedToday,
      requested,
    };
  }

  return {
    ok: true,
    quotaRemaining,
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
