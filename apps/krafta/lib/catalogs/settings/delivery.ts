// Per-catalog delivery-zone settings (stored in catalogs.settings_delivery).
//
// The merchant sets a delivery ORIGIN (their cafe's location), a RADIUS, and a
// flat FEE. The storefront checkout uses these to reject delivery addresses
// outside the zone and to quote the fee. Distance is a client/server Haversine
// against the origin — no PostGIS needed for a single radius.

export type DeliverySettings = {
  /** Out-of-zone gating is active. Only true when an origin is set. */
  enabled: boolean;
  /** The cafe's location — the delivery origin. */
  originLat: number | null;
  originLng: number | null;
  /** Delivery radius in metres. */
  radiusM: number;
  /** Flat delivery fee in minor units (cents / tiyin). */
  feeCents: number;
  /** Minimum order (minor units) required for delivery; 0 = none. */
  minOrderCents: number;
};

export const defaultDeliverySettings: DeliverySettings = {
  enabled: false,
  originLat: null,
  originLng: null,
  radiusM: 5000,
  feeCents: 0,
  minOrderCents: 0,
};

function num(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function nullableNum(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function normalizeDeliverySettings(
  raw: Partial<DeliverySettings> | Record<string, unknown> = {},
): DeliverySettings {
  const t = raw as Partial<DeliverySettings>;
  const originLat = nullableNum(t.originLat);
  const originLng = nullableNum(t.originLng);
  return {
    // Gating only makes sense with an origin — guard the flag so a stale
    // `enabled: true` without coords can never reject every address.
    enabled: t.enabled === true && originLat != null && originLng != null,
    originLat,
    originLng,
    radiusM: Math.max(100, Math.round(num(t.radiusM, defaultDeliverySettings.radiusM))),
    feeCents: Math.max(0, Math.round(num(t.feeCents, 0))),
    minOrderCents: Math.max(0, Math.round(num(t.minOrderCents, 0))),
  };
}

/** Great-circle distance in metres (Haversine). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance from the delivery origin to a point, or null if no origin set. */
export function deliveryDistanceMeters(
  s: DeliverySettings,
  lat: number,
  lng: number,
): number | null {
  if (s.originLat == null || s.originLng == null) return null;
  return haversineMeters(s.originLat, s.originLng, lat, lng);
}

/** Whether a delivery point is within the zone. With gating off, everything is
 *  in-zone (the merchant hasn't restricted delivery). */
export function isWithinDeliveryZone(
  s: DeliverySettings,
  lat: number,
  lng: number,
): boolean {
  if (!s.enabled) return true;
  const d = deliveryDistanceMeters(s, lat, lng);
  return d == null || d <= s.radiusM;
}
