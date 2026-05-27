import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side idempotency dedup for cart mutations (KRA-108).
 *
 * The client generates `crypto.randomUUID()` per logical user action and
 * threads it as `idempotencyKey` into every cart server action. This
 * wrapper caches the action's first result in `commerce.processed_actions`
 * and short-circuits subsequent calls with the same key to return the
 * cached result.
 *
 * Why: structurally closes the duplicate-write classes that plagued the
 * pre-v2 cart — multi-tab races, React-19 strict-mode double-invoke of
 * transitions, persistent-queue replay, browser-refresh-during-flight.
 * One key = one logical operation, every time.
 *
 * Stripe / Square pattern:
 *   https://stripe.com/blog/idempotency
 *   https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency
 *
 * No key supplied → bypass dedup and run the action directly. This is the
 * back-compat path for any caller that hasn't yet been updated; can be
 * removed once all consumers pass a key.
 *
 * Failure modes & semantics:
 *   - If the SELECT for the cached row fails (auth race, network blip),
 *     we fall through to executing the action. Worst case: the request
 *     runs twice, and on the second-call cache write we hit a PK conflict
 *     and silently ignore it — the action is now in the cache but the
 *     caller already got a fresh result on its first call.
 *   - If the INSERT for the cache row fails (PK conflict because another
 *     concurrent request already cached its result), we still return the
 *     fresh result from `fn()`. The next call with the same key will read
 *     the cached row.
 *   - RLS scopes both the SELECT and the INSERT to the authenticated
 *     customer's own rows (see migration 20260527130000), so a forged
 *     key can't read another customer's cached result.
 *
 * Result shape: the cached `result` column is JSONB. We serialize via
 * Postgres' implicit JSON conversion. Callers should return JSON-safe
 * values (CartSummary is — Date columns come back as ISO strings).
 */
export async function withIdempotency<T>(
  key: string | undefined,
  customerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();

  const supabase = await createClient();

  // Read existing cached result if any. RLS limits visibility to this
  // customer's rows; a missing row is the common case (fresh action).
  const { data: existing, error: selectError } = await supabase
    .schema("commerce")
    .from("processed_actions")
    .select("result")
    .eq("id", key)
    .maybeSingle();

  if (!selectError && existing) {
    // Cast back from JSON. The caller wrote a T, the DB stored its JSON
    // serialization, we return that — for cart actions T is CartSummary
    // which round-trips cleanly through JSONB.
    return existing.result as T;
  }

  // Cache miss — execute the action.
  const result = await fn();

  // Cache the result. A concurrent request with the same key may have
  // already inserted; in that case our INSERT hits a PK conflict and
  // returns null. We swallow that error: the cache is best-effort and
  // the action already executed once on our path. Re-running the same
  // key in the future will return whichever insert won the race.
  await supabase
    .schema("commerce")
    .from("processed_actions")
    .insert({ id: key, customer_id: customerId, result: result as unknown as never });

  return result;
}
