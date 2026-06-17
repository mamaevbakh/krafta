import { afterEach, describe, expect, it, vi } from "vitest";

import { yandexProvider } from "./yandex";

/**
 * Pins the load-bearing Yandex check-price mapping the storefront relies on:
 * Decimal price -> feeCents (x100), currency_rules.code -> currency, the
 * 409 suitable_offer_not_found degradation (the real Tashkent response today),
 * the 401 auth signal, and the GeoJSON [lng,lat] + singular taxi_class wire shape.
 */

function mockFetch(status: number, bodyObj: unknown) {
  const text = bodyObj == null ? "" : JSON.stringify(bodyObj);
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
  });
}

const PICKUP = { lat: 41.2995, lng: 69.2401, fullname: "Cafe" };
const DROPOFF = { lat: 41.3111, lng: 69.2797, fullname: "Customer" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("yandexProvider.quotePrice", () => {
  it("maps a 200 price + currency_rules to feeCents (x100) and currency", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        price: "15000",
        currency_rules: { code: "UZS", sign: "сум" },
        distance_meters: 3200,
        eta: 25,
      }),
    );
    const q = await yandexProvider.quotePrice("tok", {
      pickup: PICKUP,
      dropoff: DROPOFF,
    });
    expect(q.available).toBe(true);
    expect(q.feeCents).toBe(1_500_000); // 15000 soum -> tiyin
    expect(q.currency).toBe("UZS");
    expect(q.distanceMeters).toBe(3200);
    expect(q.etaMinutes).toBe(25);
  });

  it("treats 409 suitable_offer_not_found as unavailable (no_offer), not an error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(409, { code: "errors.suitable_offer_not_found" }),
    );
    const q = await yandexProvider.quotePrice("tok", {
      pickup: PICKUP,
      dropoff: DROPOFF,
    });
    expect(q.available).toBe(false);
    expect(q.unavailableReason).toBe("no_offer");
    expect(q.feeCents).toBeNull();
  });

  it("treats 401 as an auth failure (distinct reason)", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { code: "unauthorized" }));
    const q = await yandexProvider.quotePrice("bad", {
      pickup: PICKUP,
      dropoff: DROPOFF,
    });
    expect(q.available).toBe(false);
    expect(q.unavailableReason).toBe("auth");
  });

  it("sends GeoJSON [lng,lat] coordinates and a singular taxi_class", async () => {
    const fetchMock = mockFetch(200, {
      price: "1.0",
      currency_rules: { code: "UZS" },
    });
    vi.stubGlobal("fetch", fetchMock);
    await yandexProvider.quotePrice("tok", {
      pickup: PICKUP,
      dropoff: DROPOFF,
      taxiClass: "courier",
    });
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body.route_points[0].coordinates).toEqual([69.2401, 41.2995]); // [lng,lat]
    expect(body.requirements.taxi_class).toBe("courier"); // singular string
  });
});

describe("yandexProvider.verifyCredentials", () => {
  it("rejects a 401 as invalid_token", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { code: "unauthorized" }));
    expect(await yandexProvider.verifyCredentials("bad")).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("accepts a 409 (token valid, just no offer)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(409, { code: "errors.suitable_offer_not_found" }),
    );
    expect(await yandexProvider.verifyCredentials("tok")).toEqual({ ok: true });
  });
});
