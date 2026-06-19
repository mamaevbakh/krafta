import type { Database } from "@/lib/supabase/types";

/**
 * Provider-agnostic courier-dispatch contract.
 *
 * The storefront and dashboard speak ONLY these domain types — never a
 * provider's wire shape. Money is in MINOR UNITS (the same x100 convention
 * Krafta stores everywhere; for UZS that is tiyin, so 15000 soum -> 1500000).
 * Coordinates are plain {lat,lng}; the Yandex adapter is responsible for
 * emitting GeoJSON [lng,lat] order on the wire.
 *
 * Tokens are passed IN (resolved by lib/delivery/credentials.ts) — adapters
 * never read env, so they stay pure and unit-testable.
 *
 * `createClaim` / `acceptClaim` / `cancel` DISPATCH or mutate a real courier
 * order (billable). They are implemented but must stay GATED behind explicit
 * merchant opt-in + a serviceable contract; quote/verify/getStatus are safe.
 */

export type DeliveryProviderId = Database["commerce"]["Enums"]["delivery_provider"];

export type GeoPoint = { lat: number; lng: number; fullname: string };
export type Contact = { name: string; phone: string };

export type DeliveryStatus =
  | "pending"
  | "accepted"
  | "assigned"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "failed"
  | "unknown";

export type DeliveryQuoteRequest = {
  pickup: GeoPoint;
  dropoff: GeoPoint;
  /** Provider tariff class. Yandex: 'express' | 'courier' | 'cargo'. */
  taxiClass?: string;
};

export type QuoteUnavailableReason = "no_offer" | "auth" | "error";

export type DeliveryQuote = {
  /** True only when a real price came back. */
  available: boolean;
  feeCents: number | null;
  /** ISO currency code from the provider, e.g. 'UZS'. */
  currency: string | null;
  etaMinutes: number | null;
  distanceMeters: number | null;
  /** Set when available=false: why no quote (used to degrade vs reject token). */
  unavailableReason?: QuoteUnavailableReason;
  raw?: unknown;
};

export type CreateClaimRequest = {
  /** Idempotency key — persist ONE per order; reuse on retry, new only per new claim. */
  idempotencyKey: string;
  /** Krafta order reference, surfaced to the courier as external_order_id. */
  externalOrderId: string;
  pickup: GeoPoint & { contact: Contact };
  dropoff: GeoPoint & { contact: Contact };
  itemsSummary?: string;
  taxiClass?: string;
  /** Cash-on-delivery amount to collect, minor units. Omit/0 = prepaid. */
  codAmountCents?: number;
  codCurrency?: string;
};

export type ClaimResult = {
  providerClaimId: string;
  status: DeliveryStatus;
  /** True when the provider returned a claim awaiting an explicit accept call. */
  needsAccept: boolean;
  raw?: unknown;
};

export type StatusResult = { status: DeliveryStatus; raw?: unknown };

export type VerifyResult = { ok: boolean; reason?: "invalid_token" | "error" };

export interface DeliveryProvider {
  readonly id: DeliveryProviderId;
  /** Lightweight auth check for the dashboard connect flow. SAFE (no dispatch). */
  verifyCredentials(token: string): Promise<VerifyResult>;
  /** Price + ETA quote. SAFE — never dispatches. */
  quotePrice(token: string, req: DeliveryQuoteRequest): Promise<DeliveryQuote>;
  /** GATED — dispatches a real courier (billable). */
  createClaim(token: string, req: CreateClaimRequest): Promise<ClaimResult>;
  /** GATED — confirms a claim awaiting approval. */
  acceptClaim(token: string, claimId: string): Promise<ClaimResult>;
  /** Read a claim's current status. SAFE. */
  getStatus(token: string, claimId: string): Promise<StatusResult>;
  /** GATED — cancels a claim (may incur a paid-cancel cost). */
  cancel(
    token: string,
    claimId: string,
    opts?: { free?: boolean },
  ): Promise<StatusResult>;
}

export class DeliveryAuthError extends Error {
  constructor(message = "Delivery provider rejected the token (401).") {
    super(message);
    this.name = "DeliveryAuthError";
  }
}

export class DeliveryError extends Error {
  status: number;
  raw: unknown;
  constructor(message: string, status: number, raw: unknown) {
    super(message);
    this.name = "DeliveryError";
    this.status = status;
    this.raw = raw;
  }
}
