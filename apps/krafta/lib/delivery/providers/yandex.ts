import {
  type ClaimResult,
  type CreateClaimRequest,
  type DeliveryProvider,
  type DeliveryQuote,
  type DeliveryQuoteRequest,
  type DeliveryStatus,
  type StatusResult,
  type VerifyResult,
  DeliveryAuthError,
  DeliveryError,
} from "./types";

/**
 * Yandex Go Delivery — B2B Cargo Integration API v2.
 *
 * Verified live (2026-06-17) against the production host with a real corporate
 * token: base host, `Authorization: Bearer <token>`, POST /check-price,
 * coordinates as [lon,lat], requirements.taxi_class SINGULAR on check-price.
 * A bogus token -> 401; a real token for a not-yet-serviceable Tashkent route
 * -> 409 errors.suitable_offer_not_found (auth OK, no courier offer).
 *
 * The claim lifecycle (create/accept/info/cancel) shapes below are best-effort
 * from the v2 docs and marked UNVERIFIED — they are GATED (never called until
 * a serviceable contract + explicit merchant opt-in) and must be exercised once
 * live, with raw responses logged, before being trusted.
 *
 * Wire currency: check-price returns `price` as a Decimal STRING and
 * `currency_rules.code` (e.g. 'UZS'). Krafta stores minor units (x100), so
 * feeCents = round(price * 100) — correct for UZS (whole-soum -> tiyin) and
 * for 2-decimal currencies alike.
 */

const BASE = "https://b2b.taxi.yandex.net";
const CARGO = "/b2b/cargo/integration/v2";

// A fixed intra-Tashkent route used only to auth-probe a token (verifyCredentials).
const PROBE_PICKUP: [number, number] = [69.2401, 41.2995]; // [lng, lat]
const PROBE_DROPOFF: [number, number] = [69.2797, 41.3111];

type YFetchResult = {
  status: number;
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  text: string;
};

async function yfetch(
  token: string,
  path: string,
  opts: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<YFetchResult> {
  const { method = "POST", query, body, timeoutMs = 12_000 } = opts;
  const url = new URL(BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // RU keeps error text predictable; does not affect amounts/currency.
        "Accept-Language": "ru",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

const UNAVAILABLE = (
  reason: DeliveryQuote["unavailableReason"],
  raw?: unknown,
): DeliveryQuote => ({
  available: false,
  feeCents: null,
  currency: null,
  etaMinutes: null,
  distanceMeters: null,
  unavailableReason: reason,
  raw,
});

// Yandex claim status -> Krafta domain status.
function mapStatus(raw: unknown): DeliveryStatus {
  const s = typeof raw === "string" ? raw : "";
  if (["new", "estimating", "ready_for_approval"].includes(s)) return "pending";
  if (s === "accepted") return "accepted";
  if (["performer_lookup", "performer_draft", "performer_found"].includes(s))
    return "assigned";
  if (
    ["pickup_arrived", "ready_for_pickup_confirmation", "pickuped"].includes(s)
  )
    return "picked_up";
  if (
    ["delivery_arrived", "ready_for_delivery_confirmation", "delivering"].includes(
      s,
    )
  )
    return "delivering";
  if (["delivered", "delivered_finish", "returned_finish"].includes(s))
    return "delivered";
  if (s.startsWith("cancelled")) return "cancelled";
  if (
    ["failed", "estimating_failed", "performer_not_found", "returning"].includes(
      s,
    )
  )
    return "failed";
  return "unknown";
}

export const yandexProvider: DeliveryProvider = {
  id: "yandex",

  async verifyCredentials(token: string): Promise<VerifyResult> {
    // Any non-401 from a check-price proves the token authenticated (a 409
    // suitable_offer_not_found still means the token is valid).
    try {
      const r = await yfetch(token, `${CARGO}/check-price`, {
        method: "POST",
        timeoutMs: 10_000,
        body: {
          route_points: [
            { coordinates: PROBE_PICKUP },
            { coordinates: PROBE_DROPOFF },
          ],
          requirements: { taxi_class: "express" },
          skip_door_to_door: false,
        },
      });
      if (r.status === 401) return { ok: false, reason: "invalid_token" };
      return { ok: true };
    } catch {
      return { ok: false, reason: "error" };
    }
  },

  async quotePrice(
    token: string,
    req: DeliveryQuoteRequest,
  ): Promise<DeliveryQuote> {
    let r: YFetchResult;
    try {
      r = await yfetch(token, `${CARGO}/check-price`, {
        method: "POST",
        timeoutMs: 10_000,
        body: {
          route_points: [
            {
              coordinates: [req.pickup.lng, req.pickup.lat],
              fullname: req.pickup.fullname,
            },
            {
              coordinates: [req.dropoff.lng, req.dropoff.lat],
              fullname: req.dropoff.fullname,
            },
          ],
          requirements: { taxi_class: req.taxiClass ?? "express" },
          skip_door_to_door: false,
        },
      });
    } catch {
      return UNAVAILABLE("error");
    }

    if (r.status === 401) return UNAVAILABLE("auth", r.json);
    // 409 errors.suitable_offer_not_found = authenticated, but no courier offer.
    if (r.status === 409) return UNAVAILABLE("no_offer", r.json);
    if (!r.ok || !r.json || r.json.price == null) {
      return UNAVAILABLE("error", r.json);
    }

    const price = Number.parseFloat(String(r.json.price));
    const feeCents = Number.isFinite(price) ? Math.round(price * 100) : null;
    const currency =
      (r.json.currency_rules && r.json.currency_rules.code) ?? r.json.currency ?? null;
    const etaMinutes =
      typeof r.json.eta === "number"
        ? r.json.eta
        : typeof r.json.eta_minutes === "number"
          ? r.json.eta_minutes
          : null;
    const distanceMeters =
      typeof r.json.distance_meters === "number" ? r.json.distance_meters : null;

    return {
      available: feeCents != null,
      feeCents,
      currency,
      etaMinutes,
      distanceMeters,
      raw: r.json,
    };
  },

  // ----- GATED below: real dispatch / mutation. Not called until Phase E. -----

  async createClaim(
    token: string,
    req: CreateClaimRequest,
  ): Promise<ClaimResult> {
    // UNVERIFIED payload shape — exercise once live before trusting.
    const item = {
      title: req.itemsSummary ?? "Order",
      quantity: 1,
      cost_value: "0",
      cost_currency: req.codCurrency ?? "UZS",
      size: { length: 0.2, width: 0.2, height: 0.2 },
      weight: 1,
      pickup_point: 1,
      dropoff_point: 2,
    };
    const body: Record<string, unknown> = {
      items: [item],
      route_points: [
        {
          point_id: 1,
          visit_order: 1,
          type: "source",
          contact: {
            name: req.pickup.contact.name,
            phone: req.pickup.contact.phone,
          },
          address: {
            fullname: req.pickup.fullname,
            coordinates: [req.pickup.lng, req.pickup.lat],
          },
        },
        {
          point_id: 2,
          visit_order: 2,
          type: "destination",
          contact: {
            name: req.dropoff.contact.name,
            phone: req.dropoff.contact.phone,
          },
          address: {
            fullname: req.dropoff.fullname,
            coordinates: [req.dropoff.lng, req.dropoff.lat],
          },
        },
      ],
      client_requirements: { taxi_class: req.taxiClass ?? "express" },
      external_order_id: req.externalOrderId,
    };
    if (req.codAmountCents && req.codAmountCents > 0) {
      // payment_on_delivery: collect cash at the door. GATED on UZ COD support.
      (body.route_points as Array<Record<string, unknown>>)[1].payment_on_delivery =
        {
          customer: { full_name: req.dropoff.contact.name },
          payment_method: "card_on_receipt",
        };
    }

    const r = await yfetch(token, `${CARGO}/claims/create`, {
      method: "POST",
      query: { request_id: req.idempotencyKey },
      body,
      timeoutMs: 15_000,
    });
    if (r.status === 401) throw new DeliveryAuthError();
    if (!r.ok || !r.json?.id) {
      throw new DeliveryError("claims/create failed", r.status, r.json);
    }
    return {
      providerClaimId: String(r.json.id),
      status: mapStatus(r.json.status),
      needsAccept: r.json.status === "ready_for_approval",
      raw: r.json,
    };
  },

  async acceptClaim(token: string, claimId: string): Promise<ClaimResult> {
    // UNVERIFIED — accept may need the claim `version`; some accounts auto-accept.
    const r = await yfetch(token, `${CARGO}/claims/accept`, {
      method: "POST",
      query: { claim_id: claimId },
      body: { version: 1 },
      timeoutMs: 15_000,
    });
    if (r.status === 401) throw new DeliveryAuthError();
    if (!r.ok) throw new DeliveryError("claims/accept failed", r.status, r.json);
    return {
      providerClaimId: claimId,
      status: mapStatus(r.json?.status),
      needsAccept: false,
      raw: r.json,
    };
  },

  async getStatus(token: string, claimId: string): Promise<StatusResult> {
    // v2 claims/info is POST with claim_id query + empty body. UNVERIFIED GET/POST.
    const r = await yfetch(token, `${CARGO}/claims/info`, {
      method: "POST",
      query: { claim_id: claimId },
      body: {},
      timeoutMs: 10_000,
    });
    if (r.status === 401) throw new DeliveryAuthError();
    return { status: mapStatus(r.json?.status), raw: r.json };
  },

  async cancel(
    token: string,
    claimId: string,
    opts?: { free?: boolean },
  ): Promise<StatusResult> {
    // UNVERIFIED — cancel_state free|paid; may need the claim `version`.
    const r = await yfetch(token, `${CARGO}/claims/cancel`, {
      method: "POST",
      query: { claim_id: claimId },
      body: { version: 1, cancel_state: opts?.free ? "free" : "paid" },
      timeoutMs: 15_000,
    });
    if (r.status === 401) throw new DeliveryAuthError();
    return { status: mapStatus(r.json?.status ?? "cancelled"), raw: r.json };
  },
};
