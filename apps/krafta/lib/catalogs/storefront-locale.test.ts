/**
 * storefront-locale.test.ts — resolveStorefrontLocale precedence + fallback.
 *
 * The storefront's active locale now blends four signals against a catalog's
 * *enabled* locale set. The whole point is that an unavailable choice (a
 * customer who prefers ru at a shop that doesn't offer it) falls through
 * cleanly rather than showing a half-translated UI — so the enabled-set
 * gating is the thing worth pinning.
 */

import { describe, expect, it } from "vitest";

import { resolveStorefrontLocale } from "./storefront-locale";

const ENABLED = ["en", "ru", "uz-Latn"];

describe("resolveStorefrontLocale", () => {
  it("honors an explicit ?lang above everything", () => {
    expect(
      resolveStorefrontLocale({
        requested: "uz-Latn",
        enabled: ENABLED,
        default: "en",
        preference: "ru",
        acceptLanguage: "en",
      }),
    ).toBe("uz-Latn");
  });

  it("uses the stored preference when no ?lang", () => {
    expect(
      resolveStorefrontLocale({
        requested: undefined,
        enabled: ENABLED,
        default: "en",
        preference: "ru",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("ru");
  });

  it("falls back past an unavailable preference (shop doesn't offer it)", () => {
    // Customer prefers ru, but this shop only offers en + it → skip ru, then
    // Accept-Language (also unavailable) → catalog default.
    expect(
      resolveStorefrontLocale({
        requested: null,
        enabled: ["en", "it"],
        default: "it",
        preference: "ru",
        acceptLanguage: "ru-RU,ru;q=0.9",
      }),
    ).toBe("it");
  });

  it("localizes from Accept-Language when no ?lang or preference (point 0)", () => {
    // Primary-subtag match: browser "ru-RU" → enabled "ru".
    expect(
      resolveStorefrontLocale({
        requested: undefined,
        enabled: ENABLED,
        default: "en",
        acceptLanguage: "ru-RU,ru;q=0.9,en;q=0.5",
      }),
    ).toBe("ru");
    // "uz" (no script) → enabled "uz-Latn".
    expect(
      resolveStorefrontLocale({
        requested: undefined,
        enabled: ENABLED,
        default: "en",
        acceptLanguage: "uz,ru;q=0.4",
      }),
    ).toBe("uz-Latn");
  });

  it("falls back to the catalog default when nothing matches", () => {
    expect(
      resolveStorefrontLocale({
        requested: "fr",
        enabled: ENABLED,
        default: "en",
        preference: "de",
        acceptLanguage: "es,fr;q=0.8",
      }),
    ).toBe("en");
  });

  it("returns the default (or null) for a catalog with no enabled locales", () => {
    expect(
      resolveStorefrontLocale({
        requested: "ru",
        enabled: [],
        default: null,
        acceptLanguage: "ru",
      }),
    ).toBeNull();
  });
});
