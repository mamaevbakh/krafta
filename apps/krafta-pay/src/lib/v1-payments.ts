import { merchantMetadata } from "@krafta/payments-core";

/**
 * Shaping for the public one-off payments resource.
 *
 * A merchant's webhook handler can be down for an afternoon. This is how they
 * reconcile afterwards — and for anyone who has not built a handler at all, it
 * is the only way to learn a payment landed. So the shape has to carry the
 * things they key on, and nothing they cannot act on.
 */

export const PAYMENT_INTENT_COLUMNS =
  "id, status, amount_minor, currency, description, order_id, metadata, created_at";

export type PaymentIntentRecord = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  description: string | null;
  order_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type PaymentAttemptRecord = {
  payment_intent_id: string;
  status: string;
  provider_id: string | null;
  provider_payment_id: string | null;
  updated_at: string | null;
};

/**
 * Serialise one payment for the API.
 *
 * Every field is named. Spreading the row would ship `metadata` whole, and that
 * column holds our own bookkeeping alongside the merchant's — see
 * `merchantMetadata`, which is shared with the outbound webhook payload so the
 * two surfaces cannot describe the same payment differently.
 */
export function serializePayment(
  intent: PaymentIntentRecord,
  attempts: PaymentAttemptRecord[],
  livemode: boolean,
) {
  const settled = attempts
    .filter((a) => a.status === "succeeded" && a.updated_at)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  const latest = attempts[0];

  return {
    object: "payment" as const,
    id: intent.id,
    status: intent.status,
    amountMinor: intent.amount_minor,
    currency: intent.currency,
    description: intent.description,
    /** The merchant's own reference. Their handle for what to release. */
    orderId: intent.order_id,
    providerId: settled?.provider_id ?? latest?.provider_id ?? null,
    providerPaymentId: settled?.provider_payment_id ?? latest?.provider_payment_id ?? null,
    createdAt: intent.created_at,
    // From the attempt, not the intent: there is no paid_at column and no
    // updated_at trigger in this schema, so the intent's updated_at would be
    // older than the charge it is supposed to describe.
    settledAt: settled?.updated_at ?? null,
    metadata: merchantMetadata(intent.metadata),
    livemode,
  };
}

/**
 * Which of these intents belong to a subscription.
 *
 * `payments.invoices.subscription_id` is NOT NULL, so "has an invoice" and "is a
 * subscription charge" are the same predicate. That is why this resource does
 * not filter on `metadata.subscription_id` — that field is merchant input,
 * copied verbatim from the create request, so a merchant whose backend happens
 * to send that key would have watched their own payments disappear from their
 * own list.
 */
export function subscriptionIntentIds(
  invoiceRows: Array<{ payment_intent_id: string | null }> | null,
): Set<string> {
  return new Set(
    (invoiceRows ?? [])
      .map((row) => row.payment_intent_id)
      .filter((value): value is string => Boolean(value)),
  );
}
