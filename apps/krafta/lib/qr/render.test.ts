import { describe, expect, it } from "vitest";

import { renderQrSvg } from "./render";

// Smoke tests for the QR renderer. We don't try to scan the result in
// the test runner (would need a QR decoder), but we lock down enough
// structural invariants to catch obvious regressions:
//   - the output is a valid <svg> with a viewBox
//   - the QR <path> from the qrcode lib lands in the output
//   - the wordmark overlay is present when withWordmark is on
//   - the wordmark text is escaped for XML safety
describe("renderQrSvg", () => {
  it("returns a self-contained SVG with a viewBox", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toMatch(/<path /);
  });

  it("includes the QR module path (not just the white background)", async () => {
    // Regression guard for the regex bug shipped in 2026-05-25: the
    // original `/<path[^>]+\/>/` matched the *first* <path> in qrcode's
    // output, which is the white background fill — leaving the rendered
    // SVG with no QR pattern at all (caught only in design review).
    // qrcode emits the dark modules as <path stroke="#000000" ...>; if
    // that path doesn't make it into the output the QR is unscannable.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg).toMatch(/<path[^>]*stroke="#000000"[^>]*\/>/);
    // And the d= for the module path should be non-trivial (many segments)
    const strokeMatch = svg.match(/<path[^>]*stroke="#000000"[^>]*d="([^"]+)"/);
    expect(strokeMatch).not.toBeNull();
    expect(strokeMatch![1].length).toBeGreaterThan(100);
  });

  it("includes the Krafta vector wordmark by default", async () => {
    // Default wordmark renders as a pre-baked vector <path>, NOT a
    // <text> element — see render.ts for the why (cross-renderer font
    // consistency). Looking for the path's first move command which is
    // unique to the Krafta glyph cluster.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg).toContain("M22.6 -71.4");
    expect(svg).toContain("fill=\"#000000\"");
    // The white cutout rect should still be there.
    expect(svg).toContain("fill=\"#FFFFFF\"");
    // And we should NOT have fallen through to the text branch.
    expect(svg).not.toContain("<text");
    // No font-family attribute means we didn't fall through to <text>.
    // (The source comment mentions "Helvetica Neue Bold" so we can't
    // grep for that string directly.)
    expect(svg).not.toMatch(/font-family\s*=/);
  });

  it("omits the wordmark when disabled", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      withWordmark: false,
    });
    expect(svg).not.toContain("M22.6 -71.4");
    expect(svg).not.toContain("<text");
  });

  it("falls back to text element for a custom wordmark string", async () => {
    // The vector path is only baked for "Krafta". Custom strings get the
    // <text> fallback rendered in the brand font stack.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      wordmark: "AcmeCo",
    });
    expect(svg).toContain("AcmeCo");
    expect(svg).toContain("<text");
    expect(svg).toMatch(/font-family\s*=\s*"'Helvetica Neue'/);
    // The Krafta vector path must NOT leak into custom-wordmark output.
    expect(svg).not.toContain("M22.6 -71.4");
  });

  it("XML-escapes wordmark text on the fallback branch", async () => {
    // Krafta has no special chars and uses the vector path; the escape
    // path matters for merchant-supplied brand names that go through
    // <text>.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      wordmark: "<Bobby> & \"Drop\"",
    });
    expect(svg).toContain("&lt;Bobby&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;Drop&quot;");
    expect(svg).not.toContain("<Bobby>");
  });

  it("respects custom output size hint", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      size: 512,
    });
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="512"');
  });
});
