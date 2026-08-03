/**
 * Outbound webhooks — Krafta Pay telling a merchant's system what happened.
 *
 * Krafta Pay had none of this. It did not need any while the only client was
 * Krafta Catalogs, which shares a database and could read `payments.*` directly.
 * Every external merchant is the opposite case: their app learns about a
 * renewal, a failure, or a recovery only if we tell them.
 *
 * This is also the deliberate answer to "notify the customer on a failed
 * charge". Krafta Pay does not send SMS or Telegram messages — we do not have
 * the merchant's subscribers' chat ids (their bot does), and SMS in Uzbekistan
 * means a carrier contract and a per-message cost. Instead
 * `subscription.payment_failed` carries a ready-to-use hosted `payUrl` and the
 * merchant's own bot sends the message, on their channel, in their voice.
 *
 * Delivery is at-least-once. `(endpoint_id, event_id)` is unique, so a
 * double-fire of the producing code enqueues one row, but a delivery whose
 * response we never saw may legitimately be retried. Consumers dedupe on the
 * payload `id`.
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecretJsonMaybe, encryptSecretJson, resolveSecretDecryptionKey } from "./secrets";
import { writePaymentLog } from "./debug-log";
import type { PayEnvironment } from "./subscription";

export const WEBHOOK_EVENT_TYPES = [
  /** Subscription record created; first payment not yet collected. */
  "subscription.created",
  /** First payment succeeded — the subscription is now live. Grant access here. */
  "subscription.activated",
  /** A renewal charge succeeded and the period advanced. */
  "subscription.renewed",
  /** A charge failed. Carries attempt count, next retry time, and a hosted payUrl. */
  "subscription.payment_failed",
  /** A previously failing subscription got paid. This is the dunning win. */
  "subscription.recovered",
  /** Billing stopped, either immediately or at period end. */
  "subscription.canceled",
  /** Billing suspended; the saved card is kept. */
  "subscription.paused",
  /** Billing resumed after a pause. */
  "subscription.resumed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/**
 * Retry backoff, in minutes after the previous attempt. Eight attempts spanning
 * ~2 days: long enough to ride out a merchant's deploy or a brief outage,
 * short enough that a dead endpoint stops burning worker budget.
 */
const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720, 1440] as const;

/** Consecutive failures before an endpoint is auto-disabled. */
const AUTO_DISABLE_THRESHOLD = 20;

const DELIVERY_TIMEOUT_MS = 10_000;
const RESPONSE_SNIPPET_LIMIT = 500;

/**
 * How long a worker owns a claimed delivery. Comfortably longer than the
 * request timeout, so a slow-but-alive endpoint is never handed to a second
 * worker mid-flight; short enough that a worker killed mid-delivery releases
 * the row within minutes rather than stranding the event.
 */
const DELIVERY_LEASE_MS = 60_000;

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

export function encryptWebhookSecret(secret: string, key: string) {
  return encryptSecretJson({ secret }, key);
}

export function decryptWebhookSecret(
  encrypted: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const decrypted = decryptSecretJsonMaybe(encrypted, env);
  if (decrypted && typeof decrypted === "object" && "secret" in decrypted) {
    const value = (decrypted as { secret?: unknown }).secret;
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * `Krafta-Signature: t=<unix-seconds>,v1=<hex hmac>`
 *
 * The signed string is `${timestamp}.${rawBody}` — the timestamp is inside the
 * MAC, so an attacker cannot replay an old body under a fresh timestamp. Same
 * construction Stripe uses, which means merchants can port a verifier they
 * already understand.
 */
export function buildWebhookSignature(params: {
  payloadBody: string;
  secret: string;
  timestampSeconds: number;
}): string {
  const signed = `${params.timestampSeconds}.${params.payloadBody}`;
  const mac = crypto.createHmac("sha256", params.secret).update(signed, "utf8").digest("hex");
  return `t=${params.timestampSeconds},v1=${mac}`;
}

/**
 * Verifier, exported so merchants can copy it and so our own tests exercise the
 * exact code path a consumer would.
 *
 * `toleranceSeconds` bounds replay: a captured request stops being accepted
 * once it ages out. Comparison is constant-time.
 */
export function verifyWebhookSignature(params: {
  payloadBody: string;
  header: string | null | undefined;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): boolean {
  if (!params.header) return false;

  const parts = params.header.split(",").reduce<Record<string, string>>((acc, chunk) => {
    const [rawKey, rawValue] = chunk.split("=");
    if (rawKey && rawValue) acc[rawKey.trim()] = rawValue.trim();
    return acc;
  }, {});

  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!Number.isFinite(timestamp) || !provided) return false;

  const tolerance = params.toleranceSeconds ?? 300;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = crypto
    .createHmac("sha256", params.secret)
    .update(`${timestamp}.${params.payloadBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function endpointWantsEvent(
  enabledEvents: unknown,
  eventType: string,
): boolean {
  // NULL / absent means "everything, including event types added later".
  if (enabledEvents === null || enabledEvents === undefined) return true;
  if (!Array.isArray(enabledEvents)) return true;
  if (enabledEvents.length === 0) return true;
  return enabledEvents.includes(eventType);
}

export type EmitWebhookEventInput = {
  orgId: string;
  environment: PayEnvironment;
  eventType: WebhookEventType;
  subscriptionId?: string | null;
  /** Event-specific body, placed under `data` in the delivered payload. */
  data: Record<string, unknown>;
};

/**
 * Fan an event out to every enabled endpoint for (org, environment) that
 * subscribes to this type. Returns the logical event id.
 *
 * NEVER THROWS. This runs inside charge finalization — a merchant with a typo
 * in their endpoint config must not be able to fail a payment that already
 * settled at the provider. Failures are logged and swallowed.
 */
export async function emitWebhookEvent(
  supabase: SupabaseClient,
  input: EmitWebhookEventInput,
): Promise<string | null> {
  try {
    const { data: endpoints, error } = await supabase
      .schema("payments")
      .from("webhook_endpoints")
      .select("id, enabled_events")
      .eq("org_id", input.orgId)
      .eq("environment", input.environment)
      .eq("status", "enabled");
    if (error) throw error;

    const targets = (endpoints ?? []).filter((endpoint) =>
      endpointWantsEvent((endpoint as { enabled_events?: unknown }).enabled_events, input.eventType),
    );
    if (targets.length === 0) return null;

    const eventId = crypto.randomUUID();
    const payload = {
      id: eventId,
      object: "event",
      type: input.eventType,
      created: new Date().toISOString(),
      livemode: input.environment === "live",
      data: input.data,
    };

    const { error: insertErr } = await supabase
      .schema("payments")
      .from("webhook_deliveries")
      .insert(
        targets.map((endpoint) => ({
          endpoint_id: (endpoint as { id: string }).id,
          org_id: input.orgId,
          environment: input.environment,
          event_id: eventId,
          event_type: input.eventType,
          subscription_id: input.subscriptionId ?? null,
          payload,
          status: "pending",
          next_attempt_at: new Date().toISOString(),
        })),
      );
    if (insertErr) throw insertErr;

    return eventId;
  } catch (error) {
    await writePaymentLog(supabase, {
      type: "webhook_out",
      event: "emit_failed",
      level: "error",
      orgId: input.orgId,
      data: {
        eventType: input.eventType,
        subscriptionId: input.subscriptionId ?? null,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

type DeliveryRow = {
  id: string;
  endpoint_id: string;
  org_id: string;
  environment: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  attempt_count: number;
};

export type DeliverWebhooksResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  exhausted: number;
  endpointsDisabled: number;
};

/**
 * Delivery worker. Claims due pending deliveries, POSTs each one, records the
 * outcome, and schedules the next attempt.
 *
 * Runs from a cron. Deliberately batch-bounded: a merchant whose endpoint has
 * been down for a day accumulates a backlog, and one sweep should drain a
 * slice of it rather than block on all of it.
 */
export async function deliverPendingWebhooks(
  supabase: SupabaseClient,
  params: { limit?: number; now?: Date } = {},
): Promise<DeliverWebhooksResult> {
  const now = params.now ?? new Date();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const result: DeliverWebhooksResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    exhausted: 0,
    endpointsDisabled: 0,
  };

  const { data: due, error } = await supabase
    .schema("payments")
    .from("webhook_deliveries")
    .select("id, endpoint_id, org_id, environment, event_id, event_type, payload, attempt_count")
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const rows = (due ?? []) as DeliveryRow[];
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  // One endpoint fetch for the whole batch — a backlog is usually many events
  // for the same handful of endpoints.
  const endpointIds = Array.from(new Set(rows.map((row) => row.endpoint_id)));
  const { data: endpointRows, error: endpointErr } = await supabase
    .schema("payments")
    .from("webhook_endpoints")
    .select("id, url, status, secret_encrypted, consecutive_failure_count")
    .in("id", endpointIds);
  if (endpointErr) throw endpointErr;

  const endpoints = new Map(
    (endpointRows ?? []).map((row) => [(row as { id: string }).id, row as Record<string, unknown>]),
  );

  for (const row of rows) {
    // Lease the row before the HTTP call. The SELECT above is not a claim: an
    // overrunning sweep overlapping the next one would read the same due rows
    // and POST each event twice. Pushing `next_attempt_at` past the lease window
    // makes the second worker's `lte(next_attempt_at, now)` filter miss it.
    //
    // Delivery is at-least-once by contract, so this is an optimization, not a
    // correctness guarantee — but "we sent your renewal event twice because our
    // cron was slow" is a bad look for a billing product, and the fix is one
    // conditional update.
    const leaseUntil = new Date(now.getTime() + DELIVERY_LEASE_MS).toISOString();
    const { data: leased, error: leaseErr } = await supabase
      .schema("payments")
      .from("webhook_deliveries")
      .update({ next_attempt_at: leaseUntil })
      .eq("id", row.id)
      .eq("status", "pending")
      .lte("next_attempt_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (leaseErr) throw leaseErr;
    if (!leased) {
      // Another worker owns it. Not our failure — do not count it either way.
      result.claimed -= 1;
      continue;
    }

    const endpoint = endpoints.get(row.endpoint_id);

    // Endpoint deleted or disabled between enqueue and delivery. Retiring the
    // row as failed is correct: nobody is listening, and leaving it pending
    // would have the worker rediscover it every sweep forever.
    if (!endpoint || endpoint.status !== "enabled") {
      await markDeliveryTerminal(supabase, row.id, {
        error: endpoint ? "endpoint_disabled" : "endpoint_missing",
      });
      result.exhausted += 1;
      continue;
    }

    const secret = decryptWebhookSecret(endpoint.secret_encrypted);
    if (!secret) {
      await markDeliveryTerminal(supabase, row.id, { error: "secret_unreadable" });
      result.exhausted += 1;
      continue;
    }

    const body = JSON.stringify(row.payload ?? {});
    const timestampSeconds = Math.floor(now.getTime() / 1000);
    const signature = buildWebhookSignature({
      payloadBody: body,
      secret,
      timestampSeconds,
    });

    const attemptNumber = (row.attempt_count ?? 0) + 1;
    const outcome = await postWebhook({
      url: String(endpoint.url),
      body,
      signature,
      eventId: row.event_id,
      eventType: row.event_type,
      attemptNumber,
    });

    if (outcome.ok) {
      await supabase
        .schema("payments")
        .from("webhook_deliveries")
        .update({
          status: "succeeded",
          attempt_count: attemptNumber,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_status_code: outcome.statusCode ?? null,
          last_error: null,
          last_response_snippet: outcome.snippet ?? null,
          next_attempt_at: null,
        })
        .eq("id", row.id);

      // Any success clears the circuit breaker.
      if (Number(endpoint.consecutive_failure_count ?? 0) > 0) {
        await supabase
          .schema("payments")
          .from("webhook_endpoints")
          .update({ consecutive_failure_count: 0, updated_at: new Date().toISOString() })
          .eq("id", row.endpoint_id);
        endpoint.consecutive_failure_count = 0;
      }

      result.succeeded += 1;
      continue;
    }

    const backoffMinutes = RETRY_BACKOFF_MINUTES[attemptNumber - 1];
    const exhausted = backoffMinutes === undefined;

    await supabase
      .schema("payments")
      .from("webhook_deliveries")
      .update({
        status: exhausted ? "failed" : "pending",
        attempt_count: attemptNumber,
        updated_at: new Date().toISOString(),
        last_status_code: outcome.statusCode ?? null,
        last_error: outcome.error ?? null,
        last_response_snippet: outcome.snippet ?? null,
        next_attempt_at: exhausted
          ? null
          : new Date(now.getTime() + backoffMinutes * 60_000).toISOString(),
      })
      .eq("id", row.id);

    if (exhausted) result.exhausted += 1;
    else result.failed += 1;

    const nextFailureCount = Number(endpoint.consecutive_failure_count ?? 0) + 1;
    endpoint.consecutive_failure_count = nextFailureCount;

    const shouldDisable = nextFailureCount >= AUTO_DISABLE_THRESHOLD;
    await supabase
      .schema("payments")
      .from("webhook_endpoints")
      .update({
        consecutive_failure_count: nextFailureCount,
        updated_at: new Date().toISOString(),
        ...(shouldDisable
          ? { status: "disabled", disabled_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", row.endpoint_id);

    if (shouldDisable) {
      endpoint.status = "disabled";
      result.endpointsDisabled += 1;
      await writePaymentLog(supabase, {
        type: "webhook_out",
        event: "endpoint_auto_disabled",
        level: "warn",
        orgId: row.org_id,
        data: {
          endpointId: row.endpoint_id,
          consecutiveFailures: nextFailureCount,
          lastError: outcome.error ?? null,
        },
      });
    }
  }

  return result;
}

async function markDeliveryTerminal(
  supabase: SupabaseClient,
  deliveryId: string,
  params: { error: string },
) {
  await supabase
    .schema("payments")
    .from("webhook_deliveries")
    .update({
      status: "failed",
      last_error: params.error,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
}

type PostOutcome = {
  ok: boolean;
  statusCode?: number;
  error?: string;
  snippet?: string;
};

async function postWebhook(params: {
  url: string;
  body: string;
  signature: string;
  eventId: string;
  eventType: string;
  attemptNumber: number;
}): Promise<PostOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(params.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "KraftaPay-Webhooks/1.0",
        "krafta-signature": params.signature,
        "krafta-event-id": params.eventId,
        "krafta-event-type": params.eventType,
        "krafta-delivery-attempt": String(params.attemptNumber),
      },
      body: params.body,
      signal: controller.signal,
      redirect: "manual",
    });

    const text = await response.text().catch(() => "");
    const snippet = text.slice(0, RESPONSE_SNIPPET_LIMIT) || undefined;

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, statusCode: response.status, snippet };
    }

    return {
      ok: false,
      statusCode: response.status,
      error: `http_${response.status}`,
      snippet,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: controller.signal.aborted ? "timeout" : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the `data` block for a subscription lifecycle event.
 *
 * Loads plan and customer so a consumer can act on one HTTP request without
 * calling back into our API. `customer.externalId` is the merchant's OWN
 * identifier — for most consumers that is the only field in here they need,
 * because it is the key into their own user table.
 */
export async function buildSubscriptionEventData(
  supabase: SupabaseClient,
  params: {
    subscriptionId: string;
    invoiceId?: string | null;
    /** Hosted checkout URL a customer can use to fix a failed payment. */
    payUrl?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<Record<string, unknown> | null> {
  const { data: subscription, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(
      "id, org_id, customer_id, plan_id, status, environment, current_period_start, current_period_end, cancel_at_period_end, canceled_at, metadata",
    )
    .eq("id", params.subscriptionId)
    .maybeSingle();
  if (error || !subscription) return null;

  const [{ data: plan }, { data: customer }] = await Promise.all([
    supabase
      .schema("payments")
      .from("plans")
      .select("id, code, name, amount_minor, currency, interval, interval_count")
      .eq("id", subscription.plan_id)
      .maybeSingle(),
    supabase
      .schema("payments")
      .from("customers")
      .select("id, external_id, email, phone, customer_user_ref, customer_org_id")
      .eq("id", subscription.customer_id)
      .maybeSingle(),
  ]);

  let invoice: Record<string, unknown> | null = null;
  if (params.invoiceId) {
    const { data: invoiceRow } = await supabase
      .schema("payments")
      .from("invoices")
      .select(
        "id, amount_due_minor, currency, status, attempt_count, due_at, paid_at, billing_period_start, billing_period_end",
      )
      .eq("id", params.invoiceId)
      .maybeSingle();
    if (invoiceRow) {
      invoice = {
        id: invoiceRow.id,
        amountDueMinor: invoiceRow.amount_due_minor,
        currency: invoiceRow.currency,
        status: invoiceRow.status,
        attemptCount: invoiceRow.attempt_count,
        dueAt: invoiceRow.due_at,
        paidAt: invoiceRow.paid_at,
        periodStart: invoiceRow.billing_period_start,
        periodEnd: invoiceRow.billing_period_end,
      };
    }
  }

  return {
    subscription: {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at,
    },
    plan: plan
      ? {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          amountMinor: plan.amount_minor,
          currency: plan.currency,
          interval: plan.interval,
          intervalCount: plan.interval_count,
        }
      : null,
    customer: customer
      ? {
          id: customer.id,
          externalId: customer.external_id,
          email: customer.email,
          phone: customer.phone,
          // Legacy Krafta-org identity. null for every merchant onboarded after
          // the external-id model; kept so Krafta's own integration is unchanged.
          customerOrgId: customer.customer_org_id,
          customerUserRef: customer.customer_user_ref,
        }
      : null,
    ...(invoice ? { invoice } : {}),
    ...(params.payUrl ? { payUrl: params.payUrl } : {}),
    ...(params.extra ?? {}),
  };
}

/**
 * Load + emit in one call — the shape almost every producer wants.
 *
 * Like `emitWebhookEvent`, never throws.
 */
export async function emitSubscriptionEvent(
  supabase: SupabaseClient,
  params: {
    eventType: WebhookEventType;
    subscriptionId: string;
    orgId: string;
    environment: PayEnvironment;
    invoiceId?: string | null;
    payUrl?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const data = await buildSubscriptionEventData(supabase, {
      subscriptionId: params.subscriptionId,
      invoiceId: params.invoiceId ?? null,
      payUrl: params.payUrl ?? null,
      extra: params.extra,
    });
    if (!data) return null;

    return await emitWebhookEvent(supabase, {
      orgId: params.orgId,
      environment: params.environment,
      eventType: params.eventType,
      subscriptionId: params.subscriptionId,
      data,
    });
  } catch (error) {
    await writePaymentLog(supabase, {
      type: "webhook_out",
      event: "emit_subscription_event_failed",
      level: "error",
      orgId: params.orgId,
      data: {
        eventType: params.eventType,
        subscriptionId: params.subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

export function requireWebhookSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = resolveSecretDecryptionKey(env);
  if (!key) throw new Error("pay_credentials_secret_missing");
  return key;
}
