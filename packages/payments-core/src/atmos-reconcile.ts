import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAtmosCredentials, atmosGet, type AtmosChargeStatus } from "./providers/atmos";
import {
  finalizeInitialPayment,
  markPaymentFailed,
  markStandaloneCheckoutFailed,
} from "./subscription";
import { writePaymentLog } from "./debug-log";
import { redactSensitive } from "./redact";

// Deferred reconciler for Atmos payment_intents stranded in 'processing'.
//
// The Atmos inline charge route (atmos/apply) settles synchronously: it charges
// at Atmos, then writes the outcome locally. If a local write (or network blip)
// fails AFTER the charge settled, the intent is left status='processing' even
// though the money moved — and the customer sees a spinner/error for a charge
// that actually succeeded.
//
// This recovers that state out-of-band: for each stuck Atmos intent we re-query
// Atmos (/merchant/pay/get) by the attempt's provider transaction id and replay
// the SAME finalize path the apply route would have run:
//   - 'succeeded' -> finalizeInitialPayment (settles subscription invoices AND
//     one-off / payment-link intents; idempotent if already finalized)
//   - 'failed'    -> markPaymentFailed (subscription dunning) or
//     markStandaloneCheckoutFailed (one-off), depending on the intent kind
//
// It NEVER blindly resets a stuck intent: if it cannot resolve a transaction id
// (the charge tx was never persisted) it skips and logs for manual review, so a
// real charge is never hidden.

const DEFAULT_OLDER_THAN_MS = 2 * 60 * 1000; // settle window before we step in
const DEFAULT_LIMIT = 50;

export type AtmosReconcileOutcome =
  | "succeeded" // Atmos confirmed the charge -> intent finalized
  | "failed" // Atmos reports the charge failed -> intent marked failed
  | "still_processing" // Atmos still pending (defensive; inline apply is sync)
  | "skipped_not_processing" // intent already moved on (e.g. finalized elsewhere)
  | "skipped_no_attempt" // not an Atmos intent (no atmos attempt) -> ignore
  | "skipped_no_transaction_id" // no resolvable tx id -> manual review, never failed
  | "error"; // lookup/finalize threw for this intent

export type AtmosReconcileItem = {
  paymentIntentId: string;
  publicToken: string | null;
  attemptId: string | null;
  transactionId: string | null;
  outcome: AtmosReconcileOutcome;
  atmosStatus?: AtmosChargeStatus;
  error?: string;
};

export type AtmosReconcileResult = {
  scanned: number;
  succeeded: number;
  failed: number;
  stillProcessing: number;
  skipped: number;
  errors: number;
  items: AtmosReconcileItem[];
};

export type ReconcileScanOptions = {
  // How stale (ms) a 'processing' intent must be before we touch it. Gives the
  // synchronous apply path time to finish before the reconciler races it.
  olderThanMs?: number;
  // Max intents to reconcile per run.
  limit?: number;
  // Target a single intent for manual recovery (skips the age filter).
  paymentIntentId?: string;
  // Target a single intent by its hosted-checkout public token.
  publicToken?: string;
};

// The Atmos status fetch is injectable so the decision logic can be unit-tested
// without a live gateway. The default loads creds + calls /merchant/pay/get.
export type ReconcileDeps = {
  fetchAtmosStatus?: (
    supabase: SupabaseClient,
    input: { orgProviderAccountId: string; transactionId: string },
  ) => Promise<AtmosChargeStatus>;
};

async function defaultFetchAtmosStatus(
  supabase: SupabaseClient,
  input: { orgProviderAccountId: string; transactionId: string },
): Promise<AtmosChargeStatus> {
  const creds = await loadAtmosCredentials(supabase, input.orgProviderAccountId);
  const { status } = await atmosGet(creds, { transactionId: input.transactionId });
  return status;
}

// The /merchant/pay/get transaction id. It is the pay/create transaction id,
// persisted on the attempt as provider_payment_id by activateSubscriptionAfterCharge.
// Fall back to the redacted providerRefs.transactionId for older records.
function resolveTransactionId(attempt: {
  provider_payment_id?: string | null;
  raw_init_response?: unknown;
}): string | null {
  const direct = attempt.provider_payment_id;
  if (typeof direct === "string" && direct.trim() !== "") return direct.trim();

  const raw = attempt.raw_init_response;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const refs = (raw as Record<string, unknown>).providerRefs;
    if (refs && typeof refs === "object" && !Array.isArray(refs)) {
      const tx = (refs as Record<string, unknown>).transactionId;
      if (typeof tx === "string" && tx.trim() !== "") return tx.trim();
      if (typeof tx === "number" && Number.isFinite(tx)) return String(tx);
    }
  }
  return null;
}

/**
 * Reconcile a single Atmos payment_intent stuck in 'processing'. Safe to call
 * repeatedly (finalize is idempotent; a non-processing intent is a no-op).
 */
export async function reconcileAtmosPaymentIntent(
  supabase: SupabaseClient,
  paymentIntentId: string,
  deps: ReconcileDeps = {},
): Promise<AtmosReconcileItem> {
  const fetchAtmosStatus = deps.fetchAtmosStatus ?? defaultFetchAtmosStatus;
  const nowIso = new Date().toISOString();

  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .select("id, status")
    .eq("id", paymentIntentId)
    .maybeSingle();
  if (intentErr) throw intentErr;
  if (!intent) {
    return {
      paymentIntentId,
      publicToken: null,
      attemptId: null,
      transactionId: null,
      outcome: "error",
      error: "payment_intent_not_found",
    };
  }

  // Best-effort: the hosted-page realtime nudge keys off public_token.
  const { data: session } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select("public_token")
    .eq("payment_intent_id", paymentIntentId)
    .order("created_at", { ascending: false })
    .maybeSingle();
  const publicToken =
    session && typeof (session as Record<string, unknown>).public_token === "string"
      ? ((session as Record<string, unknown>).public_token as string)
      : null;

  if (String(intent.status) !== "processing") {
    return {
      paymentIntentId,
      publicToken,
      attemptId: null,
      transactionId: null,
      outcome: "skipped_not_processing",
    };
  }

  const { data: attempt, error: attemptErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .select("id, org_provider_account_id, provider_payment_id, raw_init_response, status")
    .eq("payment_intent_id", paymentIntentId)
    .eq("provider_id", "atmos")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (attemptErr) throw attemptErr;
  if (!attempt) {
    // No Atmos attempt -> this 'processing' intent belongs to another provider.
    return {
      paymentIntentId,
      publicToken,
      attemptId: null,
      transactionId: null,
      outcome: "skipped_no_attempt",
    };
  }

  const attemptRow = attempt as {
    id: string;
    org_provider_account_id: string;
    provider_payment_id: string | null;
    raw_init_response: unknown;
    status: string;
  };
  const transactionId = resolveTransactionId(attemptRow);
  if (!transactionId) {
    // Cannot prove what happened at Atmos -> never auto-fail (could hide a real
    // charge). Surface for manual review.
    await writePaymentLog(supabase, {
      scope: "atmos_reconcile",
      event: "skipped_no_transaction_id",
      level: "warn",
      providerId: "atmos",
      paymentIntentId,
      paymentAttemptId: attemptRow.id,
      publicToken,
      data: { attemptStatus: attemptRow.status },
    });
    return {
      paymentIntentId,
      publicToken,
      attemptId: attemptRow.id,
      transactionId: null,
      outcome: "skipped_no_transaction_id",
    };
  }

  let atmosStatus: AtmosChargeStatus;
  try {
    atmosStatus = await fetchAtmosStatus(supabase, {
      orgProviderAccountId: attemptRow.org_provider_account_id,
      transactionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writePaymentLog(supabase, {
      scope: "atmos_reconcile",
      event: "lookup_error",
      level: "error",
      providerId: "atmos",
      paymentIntentId,
      paymentAttemptId: attemptRow.id,
      publicToken,
      data: { transactionId, error: message },
    });
    return {
      paymentIntentId,
      publicToken,
      attemptId: attemptRow.id,
      transactionId,
      outcome: "error",
      error: message,
    };
  }

  if (atmosStatus === "succeeded") {
    // Stamp a reconcile marker on the attempt (preserving providerRefs), then
    // replay the exact finalize path the apply route would have run.
    const priorRaw =
      attemptRow.raw_init_response &&
      typeof attemptRow.raw_init_response === "object" &&
      !Array.isArray(attemptRow.raw_init_response)
        ? (attemptRow.raw_init_response as Record<string, unknown>)
        : {};
    await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        raw_init_response: redactSensitive({
          ...priorRaw,
          reconcile: { at: nowIso, source: "atmos_pay_get", atmosStatus },
        }),
        updated_at: nowIso,
      })
      .eq("id", attemptRow.id);

    await finalizeInitialPayment(supabase, {
      paymentIntentId,
      providerId: "atmos",
      providerPaymentId: transactionId,
      attemptId: attemptRow.id,
    });

    await writePaymentLog(supabase, {
      scope: "atmos_reconcile",
      event: "reconciled_succeeded",
      providerId: "atmos",
      paymentIntentId,
      paymentAttemptId: attemptRow.id,
      publicToken,
      data: { transactionId },
    });

    return {
      paymentIntentId,
      publicToken,
      attemptId: attemptRow.id,
      transactionId,
      outcome: "succeeded",
      atmosStatus,
    };
  }

  if (atmosStatus === "failed") {
    const { data: invoice } = await supabase
      .schema("payments")
      .from("invoices")
      .select("id, subscription_id")
      .eq("payment_intent_id", paymentIntentId)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (invoice && (invoice as Record<string, unknown>).subscription_id) {
      // Subscription / invoice intent: markPaymentFailed drives dunning but does
      // not touch the attempt, so fail the attempt explicitly first.
      await supabase
        .schema("payments")
        .from("payment_attempts")
        .update({ status: "failed", updated_at: nowIso })
        .eq("id", attemptRow.id);
      await markPaymentFailed(supabase, {
        paymentIntentId,
        providerId: "atmos",
        providerPaymentId: transactionId,
      });
    } else {
      // One-off / payment-link intent: fail attempt + intent + checkout session.
      await markStandaloneCheckoutFailed(supabase, {
        paymentIntentId,
        providerId: "atmos",
        providerPaymentId: transactionId,
        attemptId: attemptRow.id,
      });
    }

    await writePaymentLog(supabase, {
      scope: "atmos_reconcile",
      event: "reconciled_failed",
      level: "warn",
      providerId: "atmos",
      paymentIntentId,
      paymentAttemptId: attemptRow.id,
      publicToken,
      data: { transactionId },
    });

    return {
      paymentIntentId,
      publicToken,
      attemptId: attemptRow.id,
      transactionId,
      outcome: "failed",
      atmosStatus,
    };
  }

  // 'processing' from Atmos: leave it for the next run (defensive — the inline
  // flow settles synchronously, so this is not expected).
  return {
    paymentIntentId,
    publicToken,
    attemptId: attemptRow.id,
    transactionId,
    outcome: "still_processing",
    atmosStatus,
  };
}

/**
 * Find Atmos payment_intents stuck in 'processing' (older than `olderThanMs`)
 * and reconcile each against Atmos. Pass `paymentIntentId` or `publicToken` to
 * recover a single intent on demand (the age filter is skipped in that case).
 */
export async function reconcileProcessingAtmosIntents(
  supabase: SupabaseClient,
  opts: ReconcileScanOptions = {},
  deps: ReconcileDeps = {},
): Promise<AtmosReconcileResult> {
  const olderThanMs = opts.olderThanMs ?? DEFAULT_OLDER_THAN_MS;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  let intentIds: string[] = [];
  if (opts.paymentIntentId) {
    intentIds = [opts.paymentIntentId];
  } else if (opts.publicToken) {
    const { data: session, error } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select("payment_intent_id")
      .eq("public_token", opts.publicToken)
      .maybeSingle();
    if (error) throw error;
    const pid =
      session && typeof (session as Record<string, unknown>).payment_intent_id === "string"
        ? ((session as Record<string, unknown>).payment_intent_id as string)
        : null;
    intentIds = pid ? [pid] : [];
  } else {
    const cutoffIso = new Date(Date.now() - olderThanMs).toISOString();
    const { data: rows, error } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select("id")
      .eq("status", "processing")
      .lte("updated_at", cutoffIso)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    intentIds = (rows ?? []).map((r) => (r as { id: string }).id);
  }

  const items: AtmosReconcileItem[] = [];
  for (const id of intentIds) {
    try {
      items.push(await reconcileAtmosPaymentIntent(supabase, id, deps));
    } catch (error) {
      items.push({
        paymentIntentId: id,
        publicToken: null,
        attemptId: null,
        transactionId: null,
        outcome: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    scanned: items.length,
    succeeded: items.filter((i) => i.outcome === "succeeded").length,
    failed: items.filter((i) => i.outcome === "failed").length,
    stillProcessing: items.filter((i) => i.outcome === "still_processing").length,
    skipped: items.filter(
      (i) =>
        i.outcome === "skipped_no_attempt" ||
        i.outcome === "skipped_no_transaction_id" ||
        i.outcome === "skipped_not_processing",
    ).length,
    errors: items.filter((i) => i.outcome === "error").length,
    items,
  };
}
