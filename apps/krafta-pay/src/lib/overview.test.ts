import { describe, expect, it } from "vitest";

import { monthKey, percentChange, recentMonths } from "./overview";

describe("monthKey", () => {
  it("keys by UTC month, not the reader's timezone", () => {
    // Tashkent is UTC+5. A payment at 21:00 UTC on 31 July is 02:00 on 1 August
    // locally — if this keyed on local time, the same money would land in
    // different months for different people looking at the same dashboard.
    expect(monthKey("2026-07-31T21:00:00.000Z")).toBe("2026-07");
  });

  it("pads single-digit months so keys sort as strings", () => {
    expect(monthKey("2026-03-05T00:00:00.000Z")).toBe("2026-03");
  });
});

describe("recentMonths", () => {
  it("returns six months oldest first, ending with the current one", () => {
    const months = recentMonths(new Date("2026-08-13T00:00:00.000Z"), 6);
    expect(months).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  });

  it("walks back across a year boundary", () => {
    // The off-by-one that shows up once a year and looks like data loss.
    expect(recentMonths(new Date("2026-02-10T00:00:00.000Z"), 6)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("ends on the current month even from the last day of it", () => {
    const months = recentMonths(new Date("2026-12-31T23:59:59.000Z"), 3);
    expect(months[months.length - 1]).toBe("2026-12");
  });
});

describe("percentChange", () => {
  it("reports growth and decline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(80, 100)).toBe(-20);
  });

  it("says nothing rather than something wrong when there is no baseline", () => {
    // A merchant's first month has no previous month. "+100%" and "+∞%" both
    // read as a result; the honest answer is to show no comparison at all.
    expect(percentChange(500, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it("handles a month where nothing was collected", () => {
    expect(percentChange(0, 100)).toBe(-100);
  });
});
