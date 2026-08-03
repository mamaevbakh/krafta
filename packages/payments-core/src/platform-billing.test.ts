import { describe, expect, it } from "vitest";
import {
  PLATFORM_PLANS,
  PLATFORM_PLAN_CURRENCY,
  buildPlatformInvoiceLines,
  computeUsageFeeMinor,
  getPlatformPlanDefinition,
  isPlatformFeeSubscription,
  platformPlanAmountMinor,
  platformPlanCapMinor,
  platformPricingFromPlanRow,
  sumLineItems,
} from "./platform-billing";

describe("plan pricing", () => {
  it("prices the three plans in UZS", () => {
    const start = getPlatformPlanDefinition("platform-start")!;
    const growth = getPlatformPlanDefinition("platform-growth")!;
    const scale = getPlatformPlanDefinition("platform-scale")!;

    // major x 100, UZS included: 600,000 UZS is 60,000,000. Writing the major
    // number is the bug that put a 2,000 UZS `pro` plan on prod.
    expect(platformPlanAmountMinor(start)).toBe(0);
    expect(platformPlanAmountMinor(growth)).toBe(60_000_000);
    expect(platformPlanAmountMinor(scale)).toBe(250_000_000);

    expect(platformPlanCapMinor(start)).toBe(250_000_000); // 2,500,000 UZS
    // The cap is deliberately equal to Scale's monthly fee: a Start merchant can
    // never owe more than the top tier's base.
    expect(platformPlanCapMinor(start)).toBe(platformPlanAmountMinor(scale));
    expect(platformPlanCapMinor(growth)).toBeNull();
    expect(platformPlanCapMinor(scale)).toBeNull();
  });

  it("is UZS-only, with no currency conversion in the system", () => {
    expect(PLATFORM_PLAN_CURRENCY).toBe("UZS");
    // Every price is a whole number of sums: major x 100 leaves no remainder.
    // A plan whose amount is not divisible by 100 would mean someone
    // reintroduced a converted (and therefore driftable) price.
    for (const plan of PLATFORM_PLANS) {
      expect(plan.amountMinor % 100).toBe(0);
      if (plan.usageCapMinor !== null) expect(plan.usageCapMinor % 100).toBe(0);
    }
  });

  it("declares a features map on every plan so gating has somewhere to read", () => {
    for (const plan of PLATFORM_PLANS) {
      expect(Object.keys(plan.features).length).toBeGreaterThan(0);
    }
    expect(getPlatformPlanDefinition("platform-start")!.features.hosted_checkout).toBe(false);
    expect(getPlatformPlanDefinition("platform-growth")!.features.hosted_checkout).toBe(true);
  });
});

describe("usage fee", () => {
  it("charges the plan's rate on processed volume", () => {
    // 10,000,000 UZS processed = 1,000,000,000 minor. At 0.6% -> 6,000,000 minor.
    expect(computeUsageFeeMinor(1_000_000_000, { usageRateBps: 60, usageCapMinor: null })).toEqual({
      feeMinor: 6_000_000,
      capped: false,
    });
  });

  it("caps the Start tier at its monthly ceiling", () => {
    const pricing = { usageRateBps: 100, usageCapMinor: 250_000_000 };

    // Exactly at the cap boundary: 250,000,000 UZS processed at 1% = 2,500,000 UZS.
    expect(computeUsageFeeMinor(25_000_000_000, pricing)).toEqual({
      feeMinor: 250_000_000,
      capped: false,
    });

    // Ten times over: still the cap, and flagged as capped.
    expect(computeUsageFeeMinor(260_000_000_000, pricing)).toEqual({
      feeMinor: 250_000_000,
      capped: true,
    });
  });

  it("is zero for zero volume", () => {
    expect(computeUsageFeeMinor(0, { usageRateBps: 100, usageCapMinor: 250_000_000 })).toEqual({
      feeMinor: 0,
      capped: false,
    });
  });
});

describe("plan row pricing", () => {
  it("bills at the database's numbers, not the file's", () => {
    // A plan re-rated in the database must win over the code definition, or a
    // deliberate re-rate silently does nothing.
    expect(
      platformPricingFromPlanRow({
        code: "platform-start",
        metadata: { usage_rate_bps: 80, usage_cap_minor: 999 },
      }),
    ).toEqual({ usageRateBps: 80, usageCapMinor: 999 });
  });

  it("falls back to the code definition for a row that predates the metadata", () => {
    expect(platformPricingFromPlanRow({ code: "platform-growth", metadata: {} })).toEqual({
      usageRateBps: 60,
      usageCapMinor: null,
    });
  });
});

describe("platform-fee detection", () => {
  it("recognises the metadata discriminator", () => {
    expect(
      isPlatformFeeSubscription({ subscriptionMetadata: { kind: "platform_fee" } }),
    ).toBe(true);
  });

  it("recognises the plan code prefix", () => {
    expect(isPlatformFeeSubscription({ planCode: "platform-scale" })).toBe(true);
  });

  it("leaves the platform org's OTHER subscriptions alone", () => {
    // krafta-studio also bills catalog merchants for the Krafta app. Those 10
    // Business subscriptions must never be metered as platform fees.
    expect(
      isPlatformFeeSubscription({
        subscriptionMetadata: { catalog_id: "abc" },
        planCode: "business",
      }),
    ).toBe(false);
  });
});

describe("invoice lines", () => {
  const usagePeriod = {
    usagePeriodStartIso: "2026-07-01T00:00:00.000Z",
    usagePeriodEndIso: "2026-08-01T00:00:00.000Z",
  };
  const servicePeriod = {
    servicePeriodStartIso: "2026-08-01T00:00:00.000Z",
    servicePeriodEndIso: "2026-09-01T00:00:00.000Z",
  };

  it("sums to the invoice total", () => {
    const lines = buildPlatformInvoiceLines({
      planName: "Growth",
      planAmountMinor: 60_000_000,
      pricing: { usageRateBps: 60, usageCapMinor: null },
      usage: { baseMinor: 1_000_000_000, successfulCharges: 37 },
      ...servicePeriod,
      ...usagePeriod,
    });

    expect(lines.map((line) => line.kind)).toEqual(["base", "usage"]);
    expect(sumLineItems(lines)).toBe(60_000_000 + 6_000_000);
  });

  it("snapshots the figures the merchant needs to reconcile", () => {
    const lines = buildPlatformInvoiceLines({
      planName: "Start",
      planAmountMinor: 0,
      pricing: { usageRateBps: 100, usageCapMinor: 250_000_000 },
      usage: { baseMinor: 260_000_000_000, successfulCharges: 5_000 },
      ...servicePeriod,
      ...usagePeriod,
    });

    const usageLine = lines.find((line) => line.kind === "usage")!;
    expect(usageLine.metadata).toMatchObject({
      base_minor: 260_000_000_000,
      successful_charges: 5_000,
      rate_bps: 100,
      cap_minor: 250_000_000,
      capped: true,
      usage_period_start: usagePeriod.usagePeriodStartIso,
      usage_period_end: usagePeriod.usagePeriodEndIso,
    });
    // The charge count is in the description too — it is the merchant's handle
    // for reconciling against their own records.
    expect(usageLine.description).toContain("5000 charges");
    expect(usageLine.description).toContain("capped");
  });

  it("produces a zero total for a Start merchant with no live volume", () => {
    const lines = buildPlatformInvoiceLines({
      planName: "Start",
      planAmountMinor: 0,
      pricing: { usageRateBps: 100, usageCapMinor: 250_000_000 },
      usage: { baseMinor: 0, successfulCharges: 0 },
      ...servicePeriod,
      ...usagePeriod,
    });

    expect(sumLineItems(lines)).toBe(0);
  });
});
