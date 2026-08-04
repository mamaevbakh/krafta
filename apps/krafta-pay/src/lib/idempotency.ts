import crypto from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { V1Error } from "@/lib/v1";

/**
 * Idempotency-Key handling for the public merchant API.
 *
 * A merchant's backend retries — on a timeout, a deploy, a queue redelivery.
 * Without this, a retried create makes a second payment intent, a second
 * checkout session and a second payUrl, and nothing ties them together: the
 * customer can be handed two links for one order and the merchant reconciles
 * two rows for one sale.
 *
 * CLAIM FIRST. The unique index on (org, environment, endpoint, key) is the
 * lock. `INSERT ... ON CONFLICT DO NOTHING` returns a row to exactly one
 * caller; everyone else reads what that caller is doing.
 *
 * DELIBERATELY NO RECLAIM WINDOW. An earlier design let a claim older than N
 * seconds be judged stale, deleted and retaken. That reintroduces the exact
 * duplicate this exists to prevent: a request that is merely slow — pool
 * exhaustion, a cold start, a degraded database — gets declared dead while it
 * is still running, a second one proceeds, and the first then writes into a row
 * that no longer exists and reports success to nobody. An in-flight key answers
 * 409 instead. A genuinely wedged claim is cleared by TTL, which is measured in
 * hours rather than seconds because no HTTP request lives that long.
 *
 * The weaker read-then-execute shape used by the cart (apps/krafta/lib/cart)
 * is deliberately not copied. Its own comment concedes "worst case: the request
 * runs twice", which is fine for recomputing a cart total and is not fine for
 * minting a payment.
 */

/** Rows older than this are assumed abandoned. Hours, not seconds — see above. */
const CLAIM_TTL_HOURS = 24;

export type IdempotencyOutcome<T> =
  | { kind: "fresh"; complete: (status: number, body: T) => Promise<void> }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "disabled" };

export function readIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get("idempotency-key");
  if (!raw) return null;
  const key = raw.trim();
  if (!key) return null;
  if (key.length > 255) {
    throw new V1Error(
      "idempotency_key_too_long",
      400,
      "`Idempotency-Key` must be 255 characters or fewer.",
    );
  }
  return key;
}

/** Stable fingerprint of the request body, so key reuse with a different body is caught. */
export function fingerprintBody(body: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(body)).digest("hex");
}

/** Key order must not change the fingerprint — a retry may serialise differently. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export async function beginIdempotent<T>(
  supabase: SupabaseClient,
  params: {
    key: string | null;
    orgId: string;
    environment: "test" | "live";
    endpoint: string;
    body: unknown;
  },
): Promise<IdempotencyOutcome<T>> {
  // No header means the caller has not opted in. Behaviour is unchanged for
  // every existing integration, which is what makes this safe to ship.
  if (!params.key) return { kind: "disabled" };

  const fingerprint = fingerprintBody(params.body);
  const scope = {
    org_id: params.orgId,
    environment: params.environment,
    endpoint: params.endpoint,
    idempotency_key: params.key,
  };

  const { data: claimed, error: claimErr } = await supabase
    .schema("payments")
    .from("idempotency_keys")
    .upsert({ ...scope, request_fingerprint: fingerprint, status: "in_progress" }, {
      onConflict: "org_id,environment,endpoint,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("id")
    .maybeSingle();
  if (claimErr) throw claimErr;

  if (claimed?.id) {
    const claimId = claimed.id as string;
    return {
      kind: "fresh",
      complete: async (status: number, body: T) => {
        const { error } = await supabase
          .schema("payments")
          .from("idempotency_keys")
          .update({
            status: "completed",
            response_status: status,
            response_body: body as never,
            completed_at: new Date().toISOString(),
          })
          .eq("id", claimId);
        // Not fatal: the work succeeded and the caller is getting its answer.
        // A lost record only costs the merchant a duplicate on a later retry,
        // which is strictly better than failing a request that already created
        // a payment.
        if (error) console.error("idempotency record failed", { claimId, error });
      },
    };
  }

  // Someone else holds the claim.
  const { data: existing, error: readErr } = await supabase
    .schema("payments")
    .from("idempotency_keys")
    .select("request_fingerprint, status, response_status, response_body, created_at")
    .match(scope)
    .maybeSingle();
  if (readErr) throw readErr;

  if (!existing) {
    // Lost the insert race and then found nothing — the other caller failed and
    // released its claim between the two statements. Treat it as ours to retry.
    return beginIdempotent(supabase, params);
  }

  if (existing.request_fingerprint !== fingerprint) {
    throw new V1Error(
      "idempotency_key_reused",
      422,
      "This `Idempotency-Key` was already used with a different request body.",
    );
  }

  if (existing.status === "completed") {
    return {
      kind: "replay",
      status: (existing.response_status as number) ?? 200,
      body: existing.response_body,
    };
  }

  const ageMs = Date.now() - new Date(String(existing.created_at)).getTime();
  if (ageMs > CLAIM_TTL_HOURS * 60 * 60 * 1000) {
    // Old enough that no live request could still be behind it.
    const { error: clearErr } = await supabase
      .schema("payments")
      .from("idempotency_keys")
      .delete()
      .match(scope)
      .eq("status", "in_progress");
    if (clearErr) throw clearErr;
    return beginIdempotent(supabase, params);
  }

  throw new V1Error(
    "idempotency_key_in_progress",
    409,
    "A request with this `Idempotency-Key` is still in flight. Retry shortly.",
  );
}

/**
 * Drop a claim whose handler threw, so an immediate retry is not answered 409
 * for something that never happened.
 */
export async function releaseIdempotencyClaim(
  supabase: SupabaseClient,
  params: {
    key: string | null;
    orgId: string;
    environment: "test" | "live";
    endpoint: string;
  },
): Promise<void> {
  if (!params.key) return;
  // Awaited and checked rather than `.catch()`: a PostgrestBuilder is only
  // PromiseLike, so it has `then` and no `catch` to call.
  const { error } = await supabase
    .schema("payments")
    .from("idempotency_keys")
    .delete()
    .match({
      org_id: params.orgId,
      environment: params.environment,
      endpoint: params.endpoint,
      idempotency_key: params.key,
    })
    .eq("status", "in_progress");
  if (error) console.error("idempotency release failed", { key: params.key, error });
}
