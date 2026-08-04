import type { PayMessageKey } from "@/lib/locales/catalog";

/**
 * Shaping and status rules for the merchant's Payments list.
 *
 * Pure on purpose. The merchant-facing question this page answers is "did they
 * pay", and getting that wrong in either direction is worse than the page not
 * existing — telling someone a payment landed when it did not is how a merchant
 * hands over goods for free. So the rules live here with tests rather than
 * inline in a component.
 */

export type PaymentIntentRow = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  description: string | null;
  order_id: string | null;
  created_at: string;
};

export type PaymentAttemptRow = {
  payment_intent_id: string;
  status: string;
  provider_id: string | null;
  updated_at: string | null;
};

export type PaymentListRow = {
  id: string;
  status: PaymentDisplayStatus;
  amountMinor: number;
  currency: string;
  description: string | null;
  orderId: string | null;
  providerId: string | null;
  createdAt: string;
  paidAt: string | null;
  payUrl: string | null;
};

export type PaymentDisplayStatus =
  | "succeeded"
  | "failed"
  | "canceled"
  | "processing"
  | "awaiting";

/**
 * Six intent statuses collapse to five display states, because
 * `requires_payment_method` and `requires_action` are the same thing to a
 * merchant: nobody has paid yet. `processing` stays distinct — the money may
 * still land, so "not paid" would be a lie and "paid" would be worse.
 */
export function paymentDisplayStatus(intentStatus: string): PaymentDisplayStatus {
  switch (intentStatus) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "processing":
      return "processing";
    default:
      return "awaiting";
  }
}

export const PAYMENT_STATUS_META: Record<
  PaymentDisplayStatus,
  { labelKey: PayMessageKey; variant: "success" | "warning" | "secondary" | "outline" }
> = {
  // Only `success` and `warning` are ratified status tokens (DESIGN.md
  // Decisions Log, 2026-07-12), so nothing here invents a third colour.
  succeeded: { labelKey: "payments.status.succeeded", variant: "success" },
  processing: { labelKey: "payments.status.processing", variant: "warning" },
  awaiting: { labelKey: "payments.status.awaiting", variant: "secondary" },
  failed: { labelKey: "payments.status.failed", variant: "outline" },
  canceled: { labelKey: "payments.status.canceled", variant: "outline" },
};

/**
 * When the money actually landed.
 *
 * Derived from the succeeded attempt rather than from a column on the intent,
 * because there is no `paid_at` on payment_intents and no updated_at trigger
 * anywhere in the payments schema — `finalizeInitialPayment` writes the intent's
 * status without touching updated_at, so that field would be older than the
 * charge. The attempt IS stamped on settle. Adding a real `paid_at` needs a
 * migration deployed ahead of the code, which is tracked separately.
 */
export function resolvePaidAt(
  displayStatus: PaymentDisplayStatus,
  attempts: PaymentAttemptRow[],
): string | null {
  if (displayStatus !== "succeeded") return null;
  const settled = attempts
    .filter((a) => a.status === "succeeded" && a.updated_at)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return settled[0]?.updated_at ?? null;
}

/** The provider that actually handled it, newest attempt first. */
export function resolveProviderId(attempts: PaymentAttemptRow[]): string | null {
  const settled = attempts.find((a) => a.status === "succeeded" && a.provider_id);
  if (settled?.provider_id) return settled.provider_id;
  return attempts.find((a) => a.provider_id)?.provider_id ?? null;
}

/**
 * A pay link is only offered while the payment can still be completed.
 *
 * Handing a merchant a link for a payment that already succeeded invites them to
 * send it again and charge the customer twice; handing one out for a canceled
 * payment collects money for something nobody expects to pay for.
 */
export function shouldOfferPayLink(displayStatus: PaymentDisplayStatus): boolean {
  return displayStatus === "awaiting" || displayStatus === "failed";
}

export function buildPaymentRow(input: {
  intent: PaymentIntentRow;
  attempts: PaymentAttemptRow[];
  openPublicToken: string | null;
  payBaseUrl: string;
}): PaymentListRow {
  const status = paymentDisplayStatus(input.intent.status);
  const canLink = shouldOfferPayLink(status) && input.openPublicToken && input.payBaseUrl;

  // Every field is named explicitly. Spreading the intent row would ship
  // `metadata` to the browser, and metadata carries whatever the merchant's
  // backend put there plus, on dashboard-created payments, the hardcoded demo
  // fiscal cart (SPIC / TIN) from actions.ts. None of that belongs in a list.
  return {
    id: input.intent.id,
    status,
    amountMinor: input.intent.amount_minor,
    currency: input.intent.currency,
    description: input.intent.description,
    orderId: input.intent.order_id,
    providerId: resolveProviderId(input.attempts),
    createdAt: input.intent.created_at,
    paidAt: resolvePaidAt(status, input.attempts),
    payUrl: canLink ? `${input.payBaseUrl}/pay/${input.openPublicToken}` : null,
  };
}
