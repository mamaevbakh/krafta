/**
 * i18n.test.ts — vitest carve-out for the locale write router.
 *
 * Per /plan-eng-review D11: the locale write router is the ONE bug class
 * in KRA-35 PR 1 that produces irreversible data damage if shipped wrong.
 * Silently writing a non-default-locale string into `items.name` corrupts
 * the canonical row; a `git revert` restores the UI code but not the
 * corrupted database rows. Manual QA (the v1 default per D7=C) skims
 * past edge-case mis-routing because the UI looks fine until the
 * merchant switches to the wrong locale tab.
 *
 * This file is the entire automated test surface for KRA-35 PR 1.
 * Everything else in v1 ships under the manual-QA-only decision. If
 * future tests want to share infrastructure, they extend this file's
 * vitest config (apps/krafta/vitest.config.ts) — a one-time bootstrap
 * already done by this commit.
 *
 * What we test:
 *   1. Default-locale active → writes to items.* (canonical)
 *   2. Non-default-locale active → writes to item_translations.* with the
 *      active locale
 *   3. Field name is preserved through the routing (no field swap)
 *   4. Value is passed through unchanged (router is a switch, not a
 *      transform)
 *   5. Empty / null values route correctly (don't accidentally fall to
 *      the wrong branch)
 *   6. Empty activeLocale or defaultLocale throws (defensive — making
 *      the function forgiving here would mask the bug class)
 *   7. The fallback resolver (pickLocalizedField) is also tested because
 *      it shares the same equality logic and a similar bug class (UI
 *      that silently shows non-default text without the isFallback
 *      indicator would let merchants think they've translated when they
 *      haven't).
 */

import { describe, expect, it } from "vitest";
import {
  routeLocaleWrite,
  pickLocalizedField,
  type TranslationRow,
  type ItemDefaults,
} from "./i18n";

describe("routeLocaleWrite", () => {
  // -------------------------------------------------------------------
  // The headline test: non-default locale must route to item_translations.
  // This IS the bug class D11 carves out — if this assertion ever flips,
  // the canonical items row gets corrupted with locale-mismatched text.
  // -------------------------------------------------------------------
  it("routes non-default locale writes to item_translations (the irreversible bug class)", () => {
    const target = routeLocaleWrite({
      activeLocale: "uz",
      defaultLocale: "ru",
      field: "name",
      value: "Kapuchino",
    });
    expect(target.kind).toBe("item_translations");
    expect(target.kind === "item_translations" && target.locale).toBe("uz");
    expect(target.kind === "item_translations" && target.column).toBe("name");
    expect(target.kind === "item_translations" && target.value).toBe(
      "Kapuchino",
    );
  });

  it("routes default-locale writes to items.* (canonical row)", () => {
    const target = routeLocaleWrite({
      activeLocale: "ru",
      defaultLocale: "ru",
      field: "name",
      value: "Капучино",
    });
    expect(target.kind).toBe("items");
    expect(target.kind === "items" && target.column).toBe("name");
    expect(target.kind === "items" && target.value).toBe("Капучино");
  });

  it("preserves the field name through routing (no field swap)", () => {
    const target = routeLocaleWrite({
      activeLocale: "en",
      defaultLocale: "ru",
      field: "description",
      value: "A double espresso with steamed milk.",
    });
    expect(target.column).toBe("description");
  });

  it("passes through null values without coercing to empty string", () => {
    const target = routeLocaleWrite({
      activeLocale: "uz",
      defaultLocale: "ru",
      field: "description",
      value: null,
    });
    expect(target.value).toBeNull();
  });

  it("routes image_alt the same as other fields", () => {
    const target = routeLocaleWrite({
      activeLocale: "en",
      defaultLocale: "ru",
      field: "image_alt",
      value: "Cappuccino in a white cup",
    });
    expect(target.column).toBe("image_alt");
    expect(target.kind).toBe("item_translations");
  });

  it("treats locale matching as case-sensitive (RU !== ru)", () => {
    // Deliberate strict equality — callers normalize upstream. Making
    // this function case-insensitive would mask upstream normalization
    // bugs and silently route differently than expected.
    const target = routeLocaleWrite({
      activeLocale: "RU",
      defaultLocale: "ru",
      field: "name",
      value: "Foo",
    });
    expect(target.kind).toBe("item_translations");
  });

  it("throws on empty activeLocale (rejects silently-broken inputs)", () => {
    expect(() =>
      routeLocaleWrite({
        activeLocale: "",
        defaultLocale: "ru",
        field: "name",
        value: "Foo",
      }),
    ).toThrow(/activeLocale/);
  });

  it("throws on empty defaultLocale (rejects silently-broken inputs)", () => {
    expect(() =>
      routeLocaleWrite({
        activeLocale: "uz",
        defaultLocale: "",
        field: "name",
        value: "Foo",
      }),
    ).toThrow(/defaultLocale/);
  });
});

describe("pickLocalizedField", () => {
  const defaults: ItemDefaults = {
    name: "Капучино",
    description: "Эспрессо с молоком",
    image_alt: null,
  };

  const translations: TranslationRow[] = [
    {
      locale: "uz",
      name: "Kapuchino",
      description: "Esprresso sutli",
      image_alt: null,
    },
    {
      locale: "en",
      // English has name but no description — exercises the per-field
      // fallback (name = en, description = ru fallback with isFallback=true).
      name: "Cappuccino",
      description: null,
      image_alt: null,
    },
  ];

  it("returns canonical value with isFallback=false when active=default", () => {
    const result = pickLocalizedField({
      translations,
      defaults,
      activeLocale: "ru",
      defaultLocale: "ru",
      field: "name",
    });
    expect(result.value).toBe("Капучино");
    expect(result.isFallback).toBe(false);
  });

  it("returns translated value with isFallback=false when active has translation", () => {
    const result = pickLocalizedField({
      translations,
      defaults,
      activeLocale: "uz",
      defaultLocale: "ru",
      field: "name",
    });
    expect(result.value).toBe("Kapuchino");
    expect(result.isFallback).toBe(false);
  });

  it("falls back to canonical with isFallback=true when active locale has no translation row", () => {
    const result = pickLocalizedField({
      translations,
      defaults,
      activeLocale: "kk", // Kazakh — not in translations
      defaultLocale: "ru",
      field: "name",
    });
    expect(result.value).toBe("Капучино");
    expect(result.isFallback).toBe(true);
  });

  it("falls back per-field — name translated, description falls back with isFallback=true", () => {
    const nameResult = pickLocalizedField({
      translations,
      defaults,
      activeLocale: "en",
      defaultLocale: "ru",
      field: "name",
    });
    expect(nameResult).toEqual({ value: "Cappuccino", isFallback: false });

    const descResult = pickLocalizedField({
      translations,
      defaults,
      activeLocale: "en",
      defaultLocale: "ru",
      field: "description",
    });
    // English row exists but description is null → fall back to RU.
    expect(descResult).toEqual({
      value: "Эспрессо с молоком",
      isFallback: true,
    });
  });

  it("treats empty string as missing translation (falls back)", () => {
    const result = pickLocalizedField({
      translations: [
        { locale: "en", name: "", description: null, image_alt: null },
      ],
      defaults,
      activeLocale: "en",
      defaultLocale: "ru",
      field: "name",
    });
    // Empty translation is indistinguishable from "merchant cleared the
    // field" in UI — fall back is the safer default per P2 / ER5.
    expect(result.value).toBe("Капучино");
    expect(result.isFallback).toBe(true);
  });
});
