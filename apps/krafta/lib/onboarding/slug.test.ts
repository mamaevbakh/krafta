import { describe, expect, it } from "vitest";

import { isValidSlug, suffixSlug, suggestSlug, transliterate } from "./slug";

describe("suggestSlug", () => {
  it("transliterates Russian Cyrillic shop names", () => {
    expect(suggestSlug("Чойхона Самарканд")).toBe("choyxona-samarkand");
    expect(suggestSlug("Ош Маркази")).toBe("osh-markazi");
    expect(suggestSlug("Кафе «Лето»")).toBe("kafe-leto");
  });

  it("handles Uzbek Cyrillic letters (ў қ ғ ҳ)", () => {
    expect(suggestSlug("Гўзал")).toBe("gozal");
    expect(suggestSlug("Қўқон чойхонаси")).toBe("qoqon-choyxonasi");
    expect(suggestSlug("Ғиждувон")).toBe("gijduvon");
    expect(suggestSlug("Ҳамкор")).toBe("hamkor");
  });

  it("passes Latin names through", () => {
    expect(suggestSlug("Brew Lab")).toBe("brew-lab");
    expect(suggestSlug("CAFE-24")).toBe("cafe-24");
  });

  it("drops Uzbek-Latin apostrophes instead of dashing them", () => {
    expect(suggestSlug("Oʻzbegim")).toBe("ozbegim");
    expect(suggestSlug("Bogʻbon")).toBe("bogbon");
  });

  it("strips symbols and collapses separators", () => {
    expect(suggestSlug("Чойхона №1")).toBe("choyxona-1");
    expect(suggestSlug("Кафе   24/7")).toBe("kafe-24-7");
    expect(suggestSlug("--Plov--House--")).toBe("plov-house");
  });

  it("returns empty for untransliterable input (caller falls back)", () => {
    expect(suggestSlug("🍜🍜🍜")).toBe("");
    expect(suggestSlug("和食処")).toBe("");
    expect(suggestSlug("№№")).toBe("");
    expect(suggestSlug("ab")).toBe("");
  });

  it("clamps to 64 chars without a trailing dash", () => {
    const long = suggestSlug("кафе ".repeat(30));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long.endsWith("-")).toBe(false);
    expect(isValidSlug(long)).toBe(true);
  });
});

describe("suffixSlug", () => {
  it("appends collision suffixes", () => {
    expect(suffixSlug("choyxona", 2)).toBe("choyxona-2");
    expect(suffixSlug("choyxona", 13)).toBe("choyxona-13");
  });

  it("keeps suffixed slugs within 64 chars", () => {
    const base = "x".repeat(64);
    const out = suffixSlug(base, 42);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.endsWith("-42")).toBe(true);
    expect(isValidSlug(out)).toBe(true);
  });
});

describe("transliterate", () => {
  it("covers the full Russian alphabet without gaps", () => {
    expect(transliterate("съешь ещё этих мягких французских булок")).toBe(
      "sesh eshyo etix myagkix frantsuzskix bulok",
    );
  });
});

describe("isValidSlug", () => {
  it("matches the RPC validation rules", () => {
    expect(isValidSlug("osh-markazi")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("Osh")).toBe(false);
    expect(isValidSlug("osh_markazi")).toBe(false);
    expect(isValidSlug("x".repeat(65))).toBe(false);
  });
});
