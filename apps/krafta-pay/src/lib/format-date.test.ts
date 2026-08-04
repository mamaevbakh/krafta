import { describe, expect, it } from "vitest";

import { formatPayDate } from "./format-date";

const AUG_1 = "2026-08-01T09:00:00.000Z";

describe("formatPayDate", () => {
  it("renders Russian in Russian", () => {
    // The bug this replaces: a fully Russian dashboard printing "Aug 1",
    // because toLocaleDateString(undefined) uses the browser's locale rather
    // than the one the merchant chose.
    const out = formatPayDate(AUG_1, "ru", "short");
    expect(out).toContain("авг");
    expect(out).not.toMatch(/Aug/i);
  });

  it("renders Uzbek in Uzbek, not English", () => {
    expect(formatPayDate(AUG_1, "uz-Latn", "short")).not.toMatch(/Aug/i);
  });

  it("still renders English for an English merchant", () => {
    expect(formatPayDate(AUG_1, "en", "short")).toMatch(/Aug/i);
  });

  it("omits the year in a list and keeps it on a record", () => {
    expect(formatPayDate(AUG_1, "en", "short")).not.toContain("2026");
    expect(formatPayDate(AUG_1, "en", "withYear")).toContain("2026");
  });

  it("shows a dash rather than an empty cell when there is no date", () => {
    // An empty cell reads as a rendering failure; a dash reads as "nothing yet",
    // which is what an unpaid invoice actually is.
    expect(formatPayDate(null, "ru")).toBe("—");
    expect(formatPayDate(undefined, "ru")).toBe("—");
    expect(formatPayDate("", "ru")).toBe("—");
  });

  it("shows a dash rather than Invalid Date for a bad value", () => {
    // "Invalid Date" in a billing table looks like the money is wrong.
    expect(formatPayDate("not-a-date", "ru")).toBe("—");
  });

  it("falls back to Russian for an unknown locale, matching the product default", () => {
    const out = formatPayDate(AUG_1, "de" as never, "short");
    expect(out).toContain("авг");
  });

  it("handles the real Uzbek locale code, not a guessed one", () => {
    // PayLocale is "uz-Latn", not "uz". A lookup keyed on "uz" misses every
    // Uzbek merchant and silently serves them Russian — which an earlier
    // version of this fix did.
    expect(formatPayDate(AUG_1, "uz-Latn", "short")).not.toBe(
      formatPayDate(AUG_1, "ru", "short"),
    );
  });
});
